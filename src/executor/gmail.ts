import { config } from "../app/config";
import { EmailSummaryItem } from "../types/grocery";

export interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
}

export interface GmailMessageResponse {
  id: string;
  threadId: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
}

export interface GmailThreadResponse {
  id: string;
  messages?: GmailMessageResponse[];
}

export interface GmailSendResponse {
  id: string;
  threadId: string;
}

export interface GmailProfileResponse {
  emailAddress: string;
}

export async function getGoogleEmailAccessToken(): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleEmail.clientId,
      client_secret: config.googleEmail.clientSecret,
      refresh_token: config.googleEmail.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google email token refresh failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Google email token refresh returned no access token");
  }
  return json.access_token;
}

export async function gmailGetProfile(accessToken: string): Promise<GmailProfileResponse> {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail profile fetch failed: ${response.status} ${body.slice(0, 200)}`);
  }

  return (await response.json()) as GmailProfileResponse;
}

export async function gmailListMessages(
  accessToken: string,
  query: string,
  maxResults: number
): Promise<Array<{ id: string; threadId: string }>> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", query);
  url.searchParams.set("maxResults", String(maxResults));
  for (const label of config.googleEmail.monitoredLabelIds) {
    url.searchParams.append("labelIds", label);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail list failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const json = (await response.json()) as GmailListResponse;
  return json.messages ?? [];
}

export async function gmailGetMessage(accessToken: string, messageId: string): Promise<GmailMessageResponse> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "Date");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail message fetch failed: ${response.status} ${body.slice(0, 200)}`);
  }

  return (await response.json()) as GmailMessageResponse;
}

export async function gmailGetThread(accessToken: string, threadId: string): Promise<GmailThreadResponse> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "To");
  url.searchParams.append("metadataHeaders", "Reply-To");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "Date");
  url.searchParams.append("metadataHeaders", "Message-ID");
  url.searchParams.append("metadataHeaders", "References");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail thread fetch failed: ${response.status} ${body.slice(0, 200)}`);
  }

  return (await response.json()) as GmailThreadResponse;
}

export async function gmailSendMessage(
  accessToken: string,
  raw: string,
  threadId?: string
): Promise<GmailSendResponse> {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw,
      threadId,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gmail send failed: ${response.status} ${body.slice(0, 200)}`);
  }

  return (await response.json()) as GmailSendResponse;
}

export function buildMimeMessage(input: {
  to: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const headers = [
    `To: ${input.to.join(", ")}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
  ];

  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) headers.push(`References: ${input.references}`);

  const mime = `${headers.join("\r\n")}\r\n\r\n${input.body}`;
  return Buffer.from(mime).toString("base64url");
}

export function indexHeaders(headers: Array<{ name: string; value: string }>): Record<string, string> {
  return Object.fromEntries(headers.map((header) => [header.name.toLowerCase(), header.value]));
}

export function toEmailSummaryItem(message: GmailMessageResponse): EmailSummaryItem {
  const headers = indexHeaders(message.payload?.headers ?? []);
  return {
    id: message.id,
    threadId: message.threadId,
    from: headers.from ?? "Unknown sender",
    subject: headers.subject ?? "(no subject)",
    snippet: cleanEmailSnippet(message.snippet ?? ""),
    receivedAt: headers.date ?? null,
    unread: (message.labelIds ?? []).includes("UNREAD"),
  };
}

export function extractEmailAddress(value: string): string | null {
  const match = value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match?.[0] ?? null;
}

export function extractDisplayName(value: string | null | undefined): string | null {
  if (!value) return null;
  const quoted = value.match(/"([^"]+)"/)?.[1];
  if (quoted) return quoted.trim();

  const angle = value.match(/^([^<]+)</)?.[1]?.trim();
  if (angle) return angle.replace(/^"+|"+$/g, "").trim();

  const email = extractEmailAddress(value);
  if (email && value.trim() === email) {
    return email.split("@")[0] ?? email;
  }

  const cleaned = value.replace(/[<>"]/g, "").trim();
  return cleaned || null;
}

function cleanEmailSnippet(value: string): string {
  const decoded = value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  const withoutQuotedReply = decoded
    .split(/\bOn\s.+wrote:/i)[0]
    ?.split(/\bFrom:/i)[0]
    ?.trim() ?? "";

  const normalized = withoutQuotedReply.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 177).trimEnd()}...`;
}
