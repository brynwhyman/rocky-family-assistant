import { config } from "./config";
import { Session } from "../types/grocery";
import { looksLikeExplicitCommand } from "../planner/rules";

const ROCKY_PREFIX = /^(?:hey\s+|hi\s+|ok(?:ay)?\s+)?@?rocky(?:[,:!\-]|\s)+/i;
const ROCKY_ONLY = /^(?:hey\s+|hi\s+)?@?rocky[.!?]*$/i;

type ConversationInfo = {
  sender_id?: string;
  sender?: string;
  conversation_id?: string;
  conversation_label?: string;
  chat_id?: string;
  group_id?: string;
  thread_id?: string;
  conversation_type?: string;
  chat_type?: string;
};

export interface RoutedMessage {
  rawText: string;
  userText: string;
  processedText: string;
  senderJid: string;
  replyJid: string;
  senderName: string | null;
  isGroup: boolean;
  wasAddressed: boolean;
  explicitCommand: boolean;
  shouldEngage: boolean;
}

export function routeInboundMessage(rawText: string, session?: Session): RoutedMessage {
  const info = extractConversationInfo(rawText);
  const senderJid = jidFromValue(info?.sender_id) ?? config.whatsapp.selfJid;
  const senderName = typeof info?.sender === "string" ? info.sender.trim() || null : null;
  const replyJid = determineReplyJid(info, senderJid);
  const isGroup = detectGroupConversation(info, replyJid, senderJid);
  const userText = extractUserText(rawText);
  const { strippedText, wasAddressed } = stripRockyAddress(userText);
  const explicitCommand = looksLikeExplicitCommand(strippedText, session);
  const shouldEngage = !isGroup || wasAddressed || explicitCommand;

  return {
    rawText,
    userText,
    processedText: strippedText,
    senderJid,
    replyJid,
    senderName,
    isGroup,
    wasAddressed,
    explicitCommand,
    shouldEngage,
  };
}

function extractConversationInfo(raw: string): ConversationInfo | null {
  const match = raw.match(/Conversation info \(untrusted metadata\):\s*```json\s*([\s\S]*?)```/i);
  if (!match) return null;

  try {
    return JSON.parse(match[1]) as ConversationInfo;
  } catch {
    return null;
  }
}

function jidFromValue(value?: string): string | null {
  if (!value) return null;

  if (value.includes("@")) {
    return value;
  }

  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

function determineReplyJid(info: ConversationInfo | null, fallback: string): string {
  const rawTarget =
    info?.conversation_id ??
    info?.conversation_label ??
    info?.chat_id ??
    info?.group_id ??
    info?.thread_id ??
    info?.sender_id;

  return jidFromValue(rawTarget) ?? fallback;
}

function detectGroupConversation(info: ConversationInfo | null, replyJid: string, senderJid: string): boolean {
  const typeValue = `${info?.conversation_type ?? ""} ${info?.chat_type ?? ""}`.toLowerCase();
  if (typeValue.includes("group")) return true;
  if (replyJid.endsWith("@g.us")) return true;
  if (replyJid !== senderJid) return true;
  return false;
}

function stripRockyAddress(text: string): { strippedText: string; wasAddressed: boolean } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { strippedText: "", wasAddressed: false };
  }

  if (ROCKY_ONLY.test(trimmed)) {
    return { strippedText: "help", wasAddressed: true };
  }

  if (ROCKY_PREFIX.test(trimmed)) {
    return {
      strippedText: trimmed.replace(ROCKY_PREFIX, "").trim(),
      wasAddressed: true,
    };
  }

  return { strippedText: trimmed, wasAddressed: false };
}

function extractUserText(raw: string): string {
  const parts = raw.split(/\n{2,}/);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const chunk = parts[i].trim();
    if (chunk && !chunk.startsWith("```") && !chunk.startsWith("Conversation info") && !chunk.startsWith("Sender")) {
      return chunk;
    }
  }
  return raw.trim();
}
