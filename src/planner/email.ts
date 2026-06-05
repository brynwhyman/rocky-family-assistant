import { EmailContact, GroceryAction, Session } from "../types/grocery";

const SEND_ASK_PATTERN = /^(?:please\s+)?(?:rocky[,!\s-]+)?email\s+(.+?)\s+and\s+ask\s+(.+)$/i;
const SEND_SAY_PATTERN = /^(?:please\s+)?(?:rocky[,!\s-]+)?send\s+(.+?)\s+an?\s+email\s+saying\s+(.+)$/i;
const SEND_EMAIL_PATTERN = /^(?:please\s+)?(?:rocky[,!\s-]+)?email\s+(.+?)\s+saying\s+(.+)$/i;
const SAVE_CONTACT_PATTERNS = [
  /^(?:please\s+)?(?:rocky[,!\s-]+)?save\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\s+for\s+(.+)$/i,
  /^(?:please\s+)?(?:rocky[,!\s-]+)?(.+?)'s\s+email\s+is\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})$/i,
  /^(?:please\s+)?(?:rocky[,!\s-]+)?(.+?)\s+is\s+([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})$/i,
];
const REPLY_PATTERN = /^(?:please\s+)?(?:rocky[,!\s-]+)?reply(?:\s+and)?\s+(?:say|that)\s+(.+)$/i;
const SUMMARIZE_INBOX_PATTERNS = [
  /^(?:please\s+)?(?:rocky[,!\s-]+)?summari[sz]e\s+my\s+inbox$/i,
  /^(?:please\s+)?(?:rocky[,!\s-]+)?any\s+important\s+emails\s+today\??$/i,
];
const UNREAD_FROM_PATTERN = /^(?:please\s+)?(?:rocky[,!\s-]+)?show\s+me\s+unread\s+emails\s+from\s+(.+)$/i;
const WATCH_THREAD_PATTERNS = [
  /^(?:please\s+)?(?:rocky[,!\s-]+)?keep\s+an?\s+eye\s+on\s+that\s+thread$/i,
  /^(?:please\s+)?(?:rocky[,!\s-]+)?tell\s+me\s+when\s+(.+?)\s+repl(?:y|ies)$/i,
];
const UNWATCH_THREAD_PATTERN = /^(?:please\s+)?(?:rocky[,!\s-]+)?stop\s+watching\s+that\s+thread$/i;
const SUMMARIZE_THREAD_PATTERN = /^(?:please\s+)?(?:rocky[,!\s-]+)?summari[sz]e\s+(?:that\s+)?thread$/i;
const EMAIL_ADDRESS_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

export function parseEmailAction(text: string, session: Session, contacts: EmailContact[]): GroceryAction | null {
  const raw = text.trim();
  if (!raw) return null;

  for (const pattern of SAVE_CONTACT_PATTERNS) {
    const match = raw.match(pattern);
    if (!match) continue;

    const [contactQuery, emailAddress] =
      pattern === SAVE_CONTACT_PATTERNS[0]
        ? [cleanContactQuery(match[2] ?? ""), (match[1] ?? "").toLowerCase()]
        : [cleanContactQuery(match[1] ?? ""), (match[2] ?? "").toLowerCase()];

    return emailAction("save_email_contact", raw, {
      to: emailAddress ? [emailAddress] : [],
      contactQuery,
      subject: null,
      body: null,
      filter: null,
      threadId: null,
    });
  }

  const sendAsk = raw.match(SEND_ASK_PATTERN);
  if (sendAsk) {
    const { contactQuery, emails } = splitContactQueryAndEmails(sendAsk[1]);
    const body = sentenceCase(sendAsk[2]);
    return emailAction("send_email", raw, {
      to: emails,
      contactQuery,
      subject: null,
      body,
      filter: null,
      threadId: null,
    });
  }

  const sendSay = raw.match(SEND_SAY_PATTERN) ?? raw.match(SEND_EMAIL_PATTERN);
  if (sendSay) {
    const { contactQuery, emails } = splitContactQueryAndEmails(sendSay[1]);
    const body = sentenceCase(sendSay[2]);
    return emailAction("send_email", raw, {
      to: emails,
      contactQuery,
      subject: null,
      body,
      filter: null,
      threadId: null,
    });
  }

  const reply = raw.match(REPLY_PATTERN);
  if (reply) {
    return emailAction("reply_email", raw, {
      to: [],
      contactQuery: null,
      subject: null,
      body: sentenceCase(reply[1]),
      filter: null,
      threadId: session.lastEmailThreadId,
    });
  }

  if (SUMMARIZE_INBOX_PATTERNS.some((pattern) => pattern.test(raw))) {
    return emailAction("summarize_inbox", raw, {
      to: [],
      contactQuery: null,
      subject: null,
      body: null,
      filter: null,
      threadId: null,
    });
  }

  const unreadFrom = raw.match(UNREAD_FROM_PATTERN);
  if (unreadFrom) {
    const contactQuery = cleanContactQuery(unreadFrom[1]);
    return emailAction("summarize_inbox", raw, {
      to: extractEmails(contactQuery),
      contactQuery,
      subject: null,
      body: null,
      filter: buildInboxFilter(contactQuery, contacts),
      threadId: null,
    });
  }

  if (WATCH_THREAD_PATTERNS.some((pattern) => pattern.test(raw))) {
    return emailAction("watch_email_thread", raw, {
      to: [],
      contactQuery: null,
      subject: null,
      body: null,
      filter: null,
      threadId: session.lastEmailThreadId,
    });
  }

  if (UNWATCH_THREAD_PATTERN.test(raw)) {
    return emailAction("unwatch_email_thread", raw, {
      to: [],
      contactQuery: null,
      subject: null,
      body: null,
      filter: null,
      threadId: session.lastEmailThreadId,
    });
  }

  if (SUMMARIZE_THREAD_PATTERN.test(raw)) {
    return emailAction("summarize_email_thread", raw, {
      to: [],
      contactQuery: null,
      subject: null,
      body: null,
      filter: null,
      threadId: session.lastEmailThreadId,
    });
  }

  return null;
}

function emailAction(action: GroceryAction["action"], raw: string, email: NonNullable<GroceryAction["email"]>): GroceryAction {
  return {
    action,
    items: [],
    calendarEvent: null,
    email,
    confirmed: false,
    clarification_needed: null,
    raw_message: raw,
  };
}

function cleanContactQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/[.?!]+$/, "");
}

function sentenceCase(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function extractEmails(value: string): string[] {
  const matches = value.match(new RegExp(EMAIL_ADDRESS_PATTERN.source, "ig")) ?? [];
  return Array.from(new Set(matches.map((match) => match.toLowerCase())));
}

function splitContactQueryAndEmails(value: string): { contactQuery: string; emails: string[] } {
  const emails = extractEmails(value);
  const withoutEmails = value.replace(new RegExp(EMAIL_ADDRESS_PATTERN.source, "ig"), " ");
  const cleaned = cleanContactQuery(
    withoutEmails
      .replace(/\bat\b/gi, " ")
      .replace(/[()<>]/g, " ")
      .replace(/\s+/g, " ")
  );

  return {
    contactQuery: cleaned || cleanContactQuery(value),
    emails,
  };
}

function buildInboxFilter(contactQuery: string, contacts: EmailContact[]): string {
  const explicitEmail = extractEmails(contactQuery)[0];
  if (explicitEmail) return explicitEmail;

  const normalized = normalize(contactQuery);
  const contact = contacts.find((entry) => normalize(entry.name) === normalized);
  return contact?.email ?? contactQuery;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
