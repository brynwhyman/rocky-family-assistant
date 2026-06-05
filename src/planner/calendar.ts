import * as chrono from "chrono-node";
import { config } from "../app/config";
import { GroceryAction, Session } from "../types/grocery";

const CALENDAR_TRIGGER_PATTERNS = [
  /\bcalendar\b/i,
  /^(?:put|schedule|book|create)\b/i,
];

const CALENDAR_LEAD_PATTERN =
  /^(?:please\s+)?(?:rocky[,!\s-]+)?(?:put|add|schedule|book|create)\s+/i;

const INVITE_PATTERN =
  /\s+(?:and\s+)?invite\s+(?:us|us\s+both|both\s+of\s+us|everyone|all\s+of\s+us|[a-z0-9@.,\s-]+)$/i;

const CALENDAR_SUFFIX_PATTERN =
  /\s+(?:on|in|to)\s+(?:(?:my|our|the)\s+)?calendar$/i;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function parseCalendarAction(text: string, _session: Session): GroceryAction | null {
  const raw = text.trim();
  if (!raw) return null;

  if (!CALENDAR_TRIGGER_PATTERNS.some((pattern) => pattern.test(raw))) {
    return null;
  }

  const parsed = chrono.parse(raw, new Date(), { forwardDate: true });
  if (parsed.length === 0) {
    return null;
  }

  const mentionedEmails = Array.from(new Set((raw.match(EMAIL_PATTERN) ?? []).map((email) => email.toLowerCase())));

  const first = parsed[0];
  const startDate = first.start.date();
  const endDate =
    first.end?.date() ??
    new Date(startDate.getTime() + config.googleCalendar.defaultDurationMinutes * 60_000);

  let working = raw.replace(CALENDAR_LEAD_PATTERN, "").trim();
  working = working.replace(INVITE_PATTERN, "").trim();
  working = working.replace(CALENDAR_SUFFIX_PATTERN, "").trim();
  working = working.replace(/\s+(?:on|in|to)\s+(?:(?:my|our|the)\s+)?calendar\b/i, "").trim();
  working = working.replace(EMAIL_PATTERN, " ").replace(/\s+/g, " ").trim();

  const dateText = first.text.trim();
  const dateRegex = new RegExp(escapeRegExp(dateText), "i");
  working = working.replace(dateRegex, " ").replace(/\s+/g, " ").trim();
  working = working
    .replace(/\s+(?:on|for|at)\s*$/i, "")
    .replace(/^(?:on|for)\s+/i, "")
    .trim();
  working = normalizeCalendarTitle(working);

  if (!working) {
    return {
      action: "unknown",
      items: [],
      calendarEvent: null,
      email: null,
      confirmed: false,
      clarification_needed: "What should I call the calendar event?",
      raw_message: raw,
    };
  }

  const title = toTitle(working);

  return {
    action: "create_calendar_event",
    items: [],
    calendarEvent: {
      title,
      startIso: startDate.toISOString(),
      endIso: endDate.toISOString(),
      timeZone: config.googleCalendar.timeZone,
      attendees: mergeAttendees(config.googleCalendar.defaultAttendees, mentionedEmails),
      location: null,
      notes: null,
    },
    email: null,
    confirmed: false,
    clarification_needed: null,
    raw_message: raw,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCalendarTitle(value: string): string {
  return value
    .replace(/^(?:something|an?\s+event|a\s+calendar\s+event)\s+for\s+/i, "")
    .replace(/^(?:something|an?\s+event|a\s+calendar\s+event)\b\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeAttendees(defaultAttendees: string[], mentionedEmails: string[]): string[] {
  return Array.from(new Set([...defaultAttendees, ...mentionedEmails].map((email) => email.toLowerCase())));
}
