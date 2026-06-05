import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { config } from "../app/config";
import { appLogger } from "../util/logging";
import { GroceryAction, Session, UserPreferences } from "../types/grocery";
import { GroceryActionSchema } from "./schemas";
import { parseDeterministicAction } from "./rules";
import { parseCalendarAction } from "./calendar";
import { parseEmailAction } from "./email";
import { loadEmailContacts } from "../memory/email";

const execFileAsync = promisify(execFile);

let _systemPrompt: string | null = null;
async function getSystemPrompt(): Promise<string> {
  if (_systemPrompt) return _systemPrompt;
  const p = path.join(config.paths.prompts, "planner-system.md");
  _systemPrompt = await fs.readFile(p, "utf-8");
  return _systemPrompt;
}

function extractJsonBlock(rawText: string): unknown {
  const jsonMatch =
    rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ??
    rawText.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    throw new Error(`Planner returned no JSON: ${rawText.slice(0, 200)}`);
  }

  return JSON.parse(jsonMatch[1]);
}

function buildContextBlock(session: Session, prefs: UserPreferences): string {
  const contextLines: string[] = [];

  if (session.pendingConfirmation) {
    contextLines.push(
      "The user has a pending order awaiting confirmation. " +
        'Only set action="checkout" and confirmed=true when the message explicitly says "confirm order", "confirm checkout", or "yes, place order". ' +
        'Do not treat vague replies like "yes", "go ahead", "do it", or "why not" as checkout confirmation.'
    );
  }

  if (prefs.brands && Object.keys(prefs.brands).length) {
    contextLines.push(`Known brand preferences: ${JSON.stringify(prefs.brands)}`);
  }

  return contextLines.length > 0
    ? `\n\n## Current context\n${contextLines.join("\n")}`
    : "";
}

async function runClaudePlanner(fullSystemPrompt: string, text: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    config.planner.claudeBin,
    [
      "-p",
      text,
      "--system-prompt",
      fullSystemPrompt,
      "--output-format",
      "text",
    ],
    {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, TERM: "dumb" },
    }
  );

  if (stderr && !stderr.includes("Warning: no stdin data received in 3s")) {
    appLogger.warn("Planner stderr", { stderr: stderr.slice(0, 200) });
  }

  return stdout.trim();
}

export async function planMessage(
  text: string,
  session: Session,
  prefs: UserPreferences
): Promise<GroceryAction> {
  const contacts = await loadEmailContacts();
  const calendarFirst = /\bcalendar\b/i.test(text) || /^(?:put|schedule|book|create)\b/i.test(text.trim());
  if (calendarFirst) {
    const calendarAction = parseCalendarAction(text, session);
    if (calendarAction) {
      appLogger.info("Planner raw response", {
        preview: JSON.stringify(calendarAction).slice(0, 120),
        planner: "deterministic-calendar",
      });
      return GroceryActionSchema.parse(calendarAction) as GroceryAction;
    }
  }

  const emailAction = parseEmailAction(text, session, contacts);
  if (emailAction) {
    appLogger.info("Planner raw response", {
      preview: JSON.stringify(emailAction).slice(0, 120),
      planner: "deterministic-email",
    });
    return GroceryActionSchema.parse(emailAction) as GroceryAction;
  }

  const deterministic = parseDeterministicAction(text, session);
  if (deterministic) {
    appLogger.info("Planner raw response", {
      preview: JSON.stringify(deterministic).slice(0, 120),
      planner: "deterministic-rules",
    });
    return GroceryActionSchema.parse(deterministic) as GroceryAction;
  }

  const calendarAction = parseCalendarAction(text, session);
  if (calendarAction) {
    appLogger.info("Planner raw response", {
      preview: JSON.stringify(calendarAction).slice(0, 120),
      planner: "deterministic-calendar",
    });
    return GroceryActionSchema.parse(calendarAction) as GroceryAction;
  }

  const systemPrompt = await getSystemPrompt();
  const fullSystemPrompt = systemPrompt + buildContextBlock(session, prefs);
  const rawText = await runClaudePlanner(fullSystemPrompt, text);

  appLogger.info("Planner raw response", {
    preview: rawText.slice(0, 120),
    planner: "claude-cli",
  });

  const parsed = extractJsonBlock(rawText);
  const validated = GroceryActionSchema.parse({ ...(parsed as object), raw_message: text });
  return validated as GroceryAction;
}
