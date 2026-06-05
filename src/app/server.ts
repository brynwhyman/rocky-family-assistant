import express, { Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { config } from "./config";
import { appLogger } from "../util/logging";
import { InboundMessage } from "../types/grocery";
import { planMessage } from "../planner/claude";
import { executeAction } from "../executor/amazon";
import { loadSession, saveSession } from "../memory/history";
import { loadPreferences } from "../memory/preferences";
import { checkGuardrails } from "../policies/guardrails";
import { formatCartSummary, getCartUrl } from "../executor/cart";
import { sendReply } from "../channels/whatsapp";
import { closeBrowser } from "../executor/browser";
import { routeInboundMessage } from "./routing";
import { extractGroupOnboardingName, isGreetingRequest, isHelpRequest } from "../planner/rules";
import { startEmailWatcher } from "../email/watcher";

export interface ServerDeps {
  processMessage?: (jid: string, text: string) => Promise<string>;
  sendReply?: (jid: string, text: string) => Promise<void>;
}

const defaultAcks = ["Got it, I'm on it."];

export function createApp(deps: ServerDeps = {}) {
  const app = express();
  const processMessageImpl = deps.processMessage ?? processMessage;
  const sendReplyImpl = deps.sendReply ?? sendReply;

  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.post(
    "/v1/chat/completions",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as {
          model?: string;
          messages?: Array<{ role: string; content: unknown }>;
          stream?: boolean;
        };

        appLogger.info("Raw completions request", {
          model: body.model,
          messageCount: body.messages?.length,
          lastMsg: JSON.stringify(body.messages?.at(-1))?.slice(0, 300),
        });

        const messages = body.messages ?? [];
        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const rawContent = lastUser?.content;
        const rawText = extractRawText(rawContent);
        const routed = routeInboundMessage(rawText);
        const text = routed.processedText;

        if (!text) {
          res.status(400).json({ error: "No user message found" });
          return;
        }

        if (!routed.shouldEngage) {
          appLogger.info("OpenAI endpoint — ignoring side conversation", {
            senderJid: routed.senderJid,
            replyJid: routed.replyJid,
            text: routed.userText,
          });

          res.json(emptyCompletion(body.model ?? "grocery/main"));
          return;
        }

        const ackText = buildShortAck();

        appLogger.info("OpenAI endpoint — user message", {
          jid: routed.replyJid,
          senderJid: routed.senderJid,
          isGroup: routed.isGroup,
          addressed: routed.wasAddressed,
          text,
        });

        void runBackgroundReply(routed.replyJid, text, processMessageImpl, sendReplyImpl);

        res.json({
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model ?? "grocery/main",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: ackText },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  app.get("/v1/models", (_req: Request, res: Response) => {
    res.json({
      object: "list",
      data: [{ id: "grocery/main", object: "model", created: 0, owned_by: "local" }],
    });
  });

  app.post(
    "/webhook/whatsapp",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as Partial<InboundMessage>;

        if (!body.jid || !body.text) {
          res.status(400).json({ error: "Missing jid or text" });
          return;
        }

        res.status(202).json({ ok: true });

        const text = body.text.trim();
        appLogger.info("Webhook message", { jid: body.jid, text: text.slice(0, 80) });

        void (async () => {
          try {
            const routed = routeInboundMessage(text);
            if (!routed.shouldEngage) {
              appLogger.info("Webhook ignore", { jid: body.jid, text: routed.userText });
              return;
            }

            await sendReplyImpl(body.jid!, buildShortAck());
            const reply = await processMessageImpl(body.jid!, routed.processedText);
            if (reply.trim()) {
              await sendReplyImpl(body.jid!, reply);
            }
            appLogger.info("Webhook reply", { reply: reply.slice(0, 120) });
          } catch (err) {
            appLogger.error("Webhook processing error", { err: String(err) });
          }
        })();
      } catch (err) {
        next(err);
      }
    }
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : "Internal server error";
    appLogger.error("Unhandled error", { message });
    res.status(500).json({ error: message });
  });

  return app;
}

export async function processMessage(jid: string, text: string): Promise<string> {
  const onboardingName = extractGroupOnboardingName(text);
  if (onboardingName) {
    return buildGroupOnboardingReply(onboardingName);
  }

  if (isHelpRequest(text)) {
    return buildHelpReply();
  }

  if (isGreetingRequest(text)) {
    return buildGreetingReply();
  }

  const session = await loadSession(jid);
  const prefs = await loadPreferences();

  let action;
  try {
    action = await planMessage(text, session, prefs);
  } catch (err) {
    appLogger.error("Planner error", { err: String(err) });
    return "Not sure what you mean sorry. Try saying it a different way.";
  }

  appLogger.info("Planned action", { jid, action: action.action, items: action.items.length });

  if (action.clarification_needed) {
    return decorateReply("clarification", action.clarification_needed);
  }

  if (action.action === "unknown") {
    return "Not sure what you mean sorry. Try saying it a different way.";
  }

  if (action.action === "cancel") {
    session.pendingConfirmation = false;
    session.pendingCart = null;
    await saveSession(session);
    return "Got it — I cancelled that and left the cart as it was.";
  }

  const guardrailResult = checkGuardrails(action, session, prefs);
  if (!guardrailResult.allowed) {
    if (guardrailResult.needsConfirmation) {
      const summary = session.pendingCart
        ? formatCartSummary(session.pendingCart)
        : "No cart summary available yet. Say 'what's in my cart' first if you want to review it.";
      session.pendingConfirmation = true;
      await saveSession(session);
      return decorateReply(
        "checkout",
        `Here's the cart before I place the order:\n\n${summary}\n\nReply "confirm order" if you want me to place it, or "cancel" to stop.`
      );
    }
    return guardrailResult.reason ?? "Action not allowed.";
  }

  let result;
  try {
    result = await executeAction(action, session, prefs);
  } catch (err) {
    appLogger.error("Executor error", { jid, err: String(err) });
    return mapExecutorErrorToReply(err);
  }

  if (result.cart) session.pendingCart = result.cart;
  if (result.emailThreadId) session.lastEmailThreadId = result.emailThreadId;
  if (action.action === "checkout" && result.status === "ok") {
    session.pendingConfirmation = false;
    session.pendingCart = null;
  }
  session.lastMessageAt = new Date().toISOString();
  session.lastSummary = result.message;
  await saveSession(session);

  return decorateReply(action.action, result.message);
}

export async function runBackgroundReply(
  jid: string,
  text: string,
  processMessageImpl: (jid: string, text: string) => Promise<string>,
  sendReplyImpl: (jid: string, text: string) => Promise<void>
): Promise<void> {
  let timeoutHandle: NodeJS.Timeout | null = null;

  try {
    const reply = await Promise.race([
      processMessageImpl(jid, text),
      new Promise<string>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("Processing timeout")), 120_000);
        timeoutHandle.unref?.();
      }),
    ]);
    if (!reply.trim()) {
      appLogger.info("Background reply skipped", { jid, reason: "empty_reply" });
      return;
    }
    await sendReplyImpl(jid, reply);
    appLogger.info("Background reply sent", {
      jid,
      preview: reply.slice(0, 120),
    });
  } catch (err) {
    appLogger.error("Background processing error", { jid, err: String(err) });
    try {
      await sendReplyImpl(
        jid,
        decorateReply("error", mapExecutorErrorToReply(err))
      );
    } catch (sendErr) {
      appLogger.error("Background error reply failed", {
        jid,
        err: String(sendErr),
      });
    }
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function buildShortAck(): string {
  return defaultAcks[Math.floor(Math.random() * defaultAcks.length)];
}

export function buildHelpReply(): string {
  return [
    "Hey, here to be the best family assistant you've ever had.",
    "If you need help with groceries, reminders, or anything in my lane, just say the word.",
    "For groceries, try \"add yogurt\", \"remove repellent\", \"what's in my cart?\", or \"place order\".",
    "For the calendar, try \"put dinner with Harry on the calendar for Friday at 7pm\".",
    "For email, try \"email Harry and ask if Friday at 7 works\", \"reply that Tuesday works for us\", or \"summarize my inbox\".",
  ].join("\n\n");
}

export function buildGreetingReply(): string {
  return "Hey. I'm here if you need me to take care of something.";
}

export function buildGroupOnboardingReply(name: string): string {
  return `Got it — welcome ${name}. I'm here if you need me to take care of groceries, reminders, or anything in my lane.`;
}

function emptyCompletion(model: string) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

export function decorateReply(action: string, message: string): string {
  if (!shouldAppendCartLink(action) || message.includes(getCartUrl())) return message;
  return `${message}\n\nCart: ${getCartUrl()}`;
}

function shouldAppendCartLink(action: string): boolean {
  return action === "view_cart" || action === "review_cart" || action === "checkout";
}

function mapExecutorErrorToReply(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("Couldn't verify the active Amazon cart")) {
    return "I couldn't verify the active Amazon cart just now, so I don't want to guess. Give me another try in a moment.";
  }

  return "Something got stuck on Amazon. Try again in a different way and I'll take another pass.";
}

export function extractRawText(rawContent: unknown): string {
  if (typeof rawContent === "string") {
    return rawContent;
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .filter((block: any) => block.type === "text")
      .map((block: any) => block.text ?? "")
      .join("\n");
  }

  return "";
}

export function startServer(app = createApp()): Server {
  const instance = app.listen(config.port, "127.0.0.1", () => {
    appLogger.info(`Grocery assistant on http://127.0.0.1:${config.port}`);
    appLogger.info(`OpenClaw provider: http://127.0.0.1:${config.port}/v1`);
    stopEmailWatcher?.();
    stopEmailWatcher = startEmailWatcher();
  });
  return instance;
}

let server: Server | null = null;
let shuttingDown = false;
let stopEmailWatcher: (() => void) | null = null;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  appLogger.info("Shutting down", { signal });

  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
    });
  }

  stopEmailWatcher?.();
  stopEmailWatcher = null;

  try {
    await closeBrowser();
  } catch (err) {
    appLogger.warn("Browser close during shutdown failed", { err: String(err) });
  }
}

if (require.main === module) {
  server = startServer();

  process.on("SIGINT", () => {
    void shutdown("SIGINT").finally(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM").finally(() => process.exit(0));
  });
}

export default createApp;
