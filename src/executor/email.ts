import { config } from "../app/config";
import {
  EmailActionPayload,
  EmailContact,
  ExecutorResult,
  Session,
} from "../types/grocery";
import {
  loadEmailContacts,
  loadLastEmailThread,
  saveLastEmailThread,
  unwatchThread,
  upsertEmailContact,
  watchThread,
} from "../memory/email";
import {
  buildMimeMessage,
  extractEmailAddress,
  gmailGetThread,
  gmailGetMessage,
  gmailListMessages,
  gmailSendMessage,
  getGoogleEmailAccessToken,
  indexHeaders,
  toEmailSummaryItem,
} from "./gmail";
import { buildNewAssistantEmailBody, buildReplyAssistantEmailBody } from "./email-tone";

export async function executeEmailAction(
  action: string,
  email: EmailActionPayload | null,
  session: Session
): Promise<ExecutorResult> {
  if (action === "save_email_contact") {
    return saveEmailContact(email ?? null);
  }

  if (!config.googleEmail.enabled) {
    return {
      status: "blocked",
      message:
        "I haven't been connected to Rocky's email yet. Once Gmail is connected, I can email people and keep an eye on threads.",
      cart: null,
      blockedReason: "email_not_configured",
    };
  }

  if (!email) {
    return {
      status: "error",
      message: "I had the idea for the email, but I couldn't work out the details.",
      cart: null,
    };
  }

  switch (action) {
    case "send_email":
      return sendEmail(email);
    case "reply_email":
      return replyToEmail(email, session);
    case "summarize_inbox":
      return summarizeInbox(email);
    case "watch_email_thread":
      return markThreadWatched(email, session);
    case "unwatch_email_thread":
      return removeThreadWatch(email, session);
    case "summarize_email_thread":
      return summarizeThread(email, session);
    default:
      return {
        status: "error",
        message: `Unknown email action: ${action}`,
        cart: null,
      };
  }
}

async function saveEmailContact(email: EmailActionPayload | null): Promise<ExecutorResult> {
  if (!email) {
    return {
      status: "needs_clarification",
      message: "I need both the name and the email address to save that contact.",
      cart: null,
    };
  }

  const address = email.to[0]?.toLowerCase();
  const name = email.contactQuery?.trim();
  if (!address || !name) {
    return {
      status: "needs_clarification",
      message: "I need both the name and the email address to save that contact.",
      cart: null,
    };
  }

  await upsertEmailContact({ name, email: address });
  return {
    status: "ok",
    message: `Got it — I'll remember ${name} as ${address}.`,
    cart: null,
  };
}

async function sendEmail(email: EmailActionPayload): Promise<ExecutorResult> {
  const contacts = await loadEmailContacts();
  const resolved = resolveRecipients(email, contacts);
  if (resolved.length === 0) {
    return {
      status: "needs_clarification",
      message: `I couldn't work out who to email from "${email.contactQuery ?? "that"}".`,
      cart: null,
    };
  }

  if (email.contactQuery && resolved.length === 1 && email.to.length > 0) {
    await upsertEmailContact({
      name: email.contactQuery,
      email: resolved[0]!,
    });
  }

  const accessToken = await getGoogleEmailAccessToken();
  const subject = deriveSubject(email.body);
  const body = buildNewAssistantEmailBody(email.contactQuery ?? resolved[0]!, email.body ?? "");
  const payload = buildMimeMessage({
    to: resolved,
    subject,
    body,
  });

  const sent = await gmailSendMessage(accessToken, payload);
  await saveLastEmailThread({ threadId: sent.threadId, subject });

  return {
    status: "ok",
    message: `Got it — I emailed ${formatList(resolved)}.`,
    cart: null,
    emailThreadId: sent.threadId,
  };
}

async function replyToEmail(email: EmailActionPayload, session: Session): Promise<ExecutorResult> {
  const threadId = email.threadId ?? session.lastEmailThreadId ?? (await loadLastEmailThread()).threadId;
  if (!threadId) {
    return {
      status: "needs_clarification",
      message: "I don't know which email thread you mean yet. Ask me to summarize the inbox or a thread first.",
      cart: null,
    };
  }

  const accessToken = await getGoogleEmailAccessToken();
  const thread = await gmailGetThread(accessToken, threadId);
  const latest = thread.messages?.at(-1);
  if (!latest) {
    return {
      status: "error",
      message: "I couldn't find the latest message in that thread.",
      cart: null,
    };
  }

  const headers = indexHeaders(latest.payload?.headers ?? []);
  const to = headers["reply-to"] ?? headers.from;
  if (!to) {
    return {
      status: "error",
      message: "I couldn't work out who to reply to on that thread.",
      cart: null,
    };
  }

  const subject = normalizeReplySubject(headers.subject ?? "Re:");
  const references = [headers.references, headers["message-id"]].filter(Boolean).join(" ").trim();
  const payload = buildMimeMessage({
    to: [extractEmailAddress(to) ?? to],
    subject,
    body: buildReplyAssistantEmailBody(to, email.body ?? ""),
    inReplyTo: headers["message-id"] ?? undefined,
    references: references || undefined,
  });

  const sent = await gmailSendMessage(accessToken, payload, threadId);
  await saveLastEmailThread({ threadId: sent.threadId, subject });

  return {
    status: "ok",
    message: `Got it — I replied and said: ${email.body ?? ""}`,
    cart: null,
    emailThreadId: sent.threadId,
  };
}

async function summarizeInbox(email: EmailActionPayload): Promise<ExecutorResult> {
  const accessToken = await getGoogleEmailAccessToken();
  const query = buildInboxQuery(email.filter);
  const messages = await gmailListMessages(accessToken, query, 5);
  if (messages.length === 0) {
    return {
      status: "ok",
      message: "Your inbox looks quiet right now.",
      cart: null,
    };
  }

  const details = await Promise.all(messages.map((message) => gmailGetMessage(accessToken, message.id)));
  const summaryItems = details.map(toEmailSummaryItem);
  await saveLastEmailThread({
    threadId: summaryItems[0]!.threadId,
    subject: summaryItems[0]!.subject,
  });

  const lines = summaryItems.map((item) => `• ${item.from} — ${item.subject}: ${item.snippet}`);
  return {
    status: "ok",
    message: `You have ${summaryItems.length} email${summaryItems.length !== 1 ? "s" : ""} worth a look.\n${lines.join("\n")}`,
    cart: null,
    emailThreadId: summaryItems[0]!.threadId,
  };
}

async function markThreadWatched(email: EmailActionPayload, session: Session): Promise<ExecutorResult> {
  const threadId = email.threadId ?? session.lastEmailThreadId ?? (await loadLastEmailThread()).threadId;
  if (!threadId) {
    return {
      status: "needs_clarification",
      message: "I don't know which thread to watch yet. Ask me to summarize the inbox or a thread first.",
      cart: null,
    };
  }

  const accessToken = await getGoogleEmailAccessToken();
  const thread = await gmailGetThread(accessToken, threadId);
  const latestMessage = thread.messages?.at(-1);
  const last = await loadLastEmailThread();
  const label = last.subject ?? (latestMessage ? toEmailSummaryItem(latestMessage).subject : "Watched thread");
  await watchThread(
    threadId,
    label,
    session.jid,
    latestMessage?.id ?? null
  );
  return {
    status: "ok",
    message: "Got it — I'll keep an eye on that thread and let you know when something comes in.",
    cart: null,
    emailThreadId: threadId,
  };
}

async function removeThreadWatch(email: EmailActionPayload, session: Session): Promise<ExecutorResult> {
  const threadId = email.threadId ?? session.lastEmailThreadId ?? (await loadLastEmailThread()).threadId;
  if (!threadId) {
    return {
      status: "needs_clarification",
      message: "I don't know which thread to stop watching yet.",
      cart: null,
    };
  }

  await unwatchThread(threadId);
  return {
    status: "ok",
    message: "Got it — I stopped watching that thread.",
    cart: null,
    emailThreadId: threadId,
  };
}

async function summarizeThread(email: EmailActionPayload, session: Session): Promise<ExecutorResult> {
  const threadId = email.threadId ?? session.lastEmailThreadId ?? (await loadLastEmailThread()).threadId;
  if (!threadId) {
    return {
      status: "needs_clarification",
      message: "I don't know which thread you mean yet.",
      cart: null,
    };
  }

  const accessToken = await getGoogleEmailAccessToken();
  const thread = await gmailGetThread(accessToken, threadId);
  const messages = (thread.messages ?? []).slice(-3).map(toEmailSummaryItem);
  if (messages.length === 0) {
    return {
      status: "ok",
      message: "That thread looks empty right now.",
      cart: null,
      emailThreadId: threadId,
    };
  }

  const lines = messages.map((item) => `• ${item.from}: ${item.snippet}`);
  await saveLastEmailThread({ threadId, subject: messages.at(-1)?.subject ?? "(no subject)" });
  return {
    status: "ok",
    message: `Here’s the latest on that thread:\n${lines.join("\n")}`,
    cart: null,
    emailThreadId: threadId,
  };
}

function resolveRecipients(email: EmailActionPayload, contacts: EmailContact[]): string[] {
  if (email.to.length > 0) {
    return email.to.map((address) => address.toLowerCase());
  }

  if (!email.contactQuery) return [];
  const explicit = extractEmailAddress(email.contactQuery);
  if (explicit) return [explicit.toLowerCase()];

  const normalized = normalize(email.contactQuery);
  const contact = contacts.find((entry) => normalize(entry.name) === normalized);
  return contact ? [contact.email.toLowerCase()] : [];
}

function buildInboxQuery(filter: string | null): string {
  const clauses = ["in:inbox", "is:unread"];
  if (filter) {
    clauses.push(`from:${filter}`);
  }
  return clauses.join(" ");
}

function deriveSubject(body: string | null): string {
  if (!body) return "Quick note";
  if (body.length <= 50) return body.replace(/[.?!]+$/, "");
  return "Quick question";
}

function normalizeReplySubject(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function formatList(values: string[]): string {
  if (values.length === 1) return values[0]!;
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
