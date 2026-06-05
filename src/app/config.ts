import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional_env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(process.env.PORT ?? "3457", 10),

  planner: {
    // Path to the Claude Code CLI binary — uses your existing Claude login,
    // no separate API key needed.
    claudeBin: resolveClaudeBin(),
  },

  whatsapp: {
    selfJid: require_env("WHATSAPP_SELF_JID"),
  },

  amazon: {
    baseUrl: process.env.AMAZON_BASE_URL ?? "https://www.amazon.co.uk",
  },

  browser: {
    profile: process.env.BROWSER_PROFILE ?? "grocery-executor",
  },

  googleCalendar: {
    enabled: process.env.GOOGLE_CALENDAR_ENABLED === "true",
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN ?? "",
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
    defaultAttendees: (process.env.GOOGLE_CALENDAR_DEFAULT_ATTENDEES ?? "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean),
    defaultDurationMinutes: parseInt(process.env.GOOGLE_CALENDAR_DEFAULT_DURATION_MINUTES ?? "60", 10),
    timeZone:
      process.env.GOOGLE_CALENDAR_TIME_ZONE ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "America/Los_Angeles",
  },

  googleEmail: {
    enabled: process.env.GOOGLE_EMAIL_ENABLED === "true",
    clientId: process.env.GOOGLE_EMAIL_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_EMAIL_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
    refreshToken: process.env.GOOGLE_EMAIL_REFRESH_TOKEN ?? "",
    monitoredLabelIds: (process.env.GOOGLE_EMAIL_MONITORED_LABEL_IDS ?? "INBOX")
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean),
    watcherIntervalMs: parseInt(process.env.GOOGLE_EMAIL_WATCHER_INTERVAL_MS ?? "60000", 10),
  },

  paths: {
    root: path.resolve(__dirname, "../.."),
    state: path.resolve(__dirname, "../../state"),
    prompts: path.resolve(__dirname, "../../prompts"),
  },
} as const;

function resolveClaudeBin(): string {
  if (process.env.CLAUDE_BIN) {
    return process.env.CLAUDE_BIN;
  }

  const claudeRoot = path.join(
    process.env.HOME ?? "",
    "Library/Application Support/Claude/claude-code"
  );

  try {
    const versions = fs
      .readdirSync(claudeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true, sensitivity: "base" }));

    for (const version of versions) {
      const candidate = path.join(claudeRoot, version, "claude.app/Contents/MacOS/claude");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  } catch {
    // Fall through to the historical default below.
  }

  return "claude";
}
