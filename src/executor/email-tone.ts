import { extractDisplayName } from "./gmail";

export function buildNewAssistantEmailBody(contactQuery: string, body: string): string {
  const firstName = friendlyRecipientName(contactQuery) ?? "there";
  return [
    `Hi ${firstName},`,
    "",
    "Rocky here, helping with scheduling and logistics.",
    body.trim(),
    "",
    "Thanks,",
    "Rocky",
  ].join("\n");
}

export function buildReplyAssistantEmailBody(recipientHeader: string | null | undefined, body: string): string {
  const recipientName = friendlyRecipientName(recipientHeader);
  const lines = [];
  if (recipientName) {
    lines.push(`Hi ${recipientName},`, "");
  }

  lines.push("Rocky here, following up on behalf of the family.", body.trim(), "", "Thanks,", "Rocky");
  return lines.join("\n");
}

export function buildWatchedThreadNotification(input: {
  from: string;
  subject: string | null;
  snippet: string | null;
}): string {
  const sender = friendlyRecipientName(input.from) ?? "Someone";
  const snippet = input.snippet?.trim();
  if (snippet) {
    return `${sender} replied — ${snippet}\n\nIf you want, I can reply from here.`;
  }

  const subject = input.subject?.trim();
  if (subject) {
    return `${sender} sent a new email on "${subject}".\n\nIf you want, I can take a look or reply from here.`;
  }

  return `${sender} sent a new email.\n\nIf you want, I can take a look or reply from here.`;
}

export function buildInboxEmailNotification(input: {
  from: string;
  subject: string | null;
  snippet: string | null;
}): string {
  const sender = friendlyRecipientName(input.from) ?? "Someone";
  const subject = input.subject?.trim() || "(no subject)";
  const snippet = input.snippet?.trim();

  if (snippet) {
    return `New email from ${sender} — "${subject}".\n${snippet}\n\nIf you want, I can reply from here.`;
  }

  return `New email from ${sender} — "${subject}".\n\nIf you want, I can take a look or reply from here.`;
}

function friendlyRecipientName(value: string | null | undefined): string | null {
  const display = extractDisplayName(value);
  if (!display) return null;
  const cleaned = display
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(/\s+/)[0] ?? cleaned;
}
