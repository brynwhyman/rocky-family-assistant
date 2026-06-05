import fs from "fs/promises";
import path from "path";
import { config } from "../app/config";
import { EmailContact, EmailSummaryItem, EmailWatch } from "../types/grocery";

const emailStateDir = path.join(config.paths.state, "email");
const contactsFile = path.join(emailStateDir, "contacts.json");
const watchedThreadsFile = path.join(emailStateDir, "watched-threads.json");
const lastThreadFile = path.join(emailStateDir, "last-thread.json");
const inboxMonitorFile = path.join(emailStateDir, "inbox-monitor.json");

type LastThreadState = {
  threadId: string | null;
  subject: string | null;
};

export type InboxMonitorState = {
  notifyJid: string | null;
  notifiedMessageIds: string[];
  lastCheckedAt: string | null;
};

async function ensureEmailStateDir(): Promise<void> {
  await fs.mkdir(emailStateDir, { recursive: true });
}

export async function loadEmailContacts(): Promise<EmailContact[]> {
  try {
    const raw = await fs.readFile(contactsFile, "utf-8");
    return JSON.parse(raw) as EmailContact[];
  } catch {
    return [];
  }
}

export async function saveEmailContacts(contacts: EmailContact[]): Promise<void> {
  await ensureEmailStateDir();
  await fs.writeFile(contactsFile, JSON.stringify(contacts, null, 2), "utf-8");
}

export async function upsertEmailContact(contact: EmailContact): Promise<void> {
  const contacts = await loadEmailContacts();
  const normalizedEmail = contact.email.toLowerCase();
  const next = contacts.filter((entry) => entry.email.toLowerCase() !== normalizedEmail);
  next.push({ name: contact.name.trim(), email: normalizedEmail });
  next.sort((left, right) => left.name.localeCompare(right.name));
  await saveEmailContacts(next);
}

export async function loadWatchedThreads(): Promise<EmailWatch[]> {
  try {
    const raw = await fs.readFile(watchedThreadsFile, "utf-8");
    const parsed = JSON.parse(raw) as Array<Partial<EmailWatch>>;
    return parsed
      .filter((entry) => typeof entry.threadId === "string" && entry.threadId.trim())
      .map((entry) => ({
        threadId: entry.threadId!,
        label: entry.label ?? "Watched thread",
        createdAt: entry.createdAt ?? new Date().toISOString(),
        notifyJid: entry.notifyJid ?? "",
        lastSeenMessageId: entry.lastSeenMessageId ?? null,
        lastNotifiedMessageId: entry.lastNotifiedMessageId ?? null,
      }))
      .filter((entry) => entry.notifyJid.trim().length > 0);
  } catch {
    return [];
  }
}

export async function saveWatchedThreads(threads: EmailWatch[]): Promise<void> {
  await ensureEmailStateDir();
  await fs.writeFile(watchedThreadsFile, JSON.stringify(threads, null, 2), "utf-8");
}

export async function watchThread(
  threadId: string,
  label: string,
  notifyJid: string,
  lastSeenMessageId: string | null
): Promise<void> {
  const threads = await loadWatchedThreads();
  const next = threads.filter((thread) => thread.threadId !== threadId);
  next.push({
    threadId,
    label,
    createdAt: new Date().toISOString(),
    notifyJid,
    lastSeenMessageId,
    lastNotifiedMessageId: null,
  });
  await saveWatchedThreads(next);
}

export async function unwatchThread(threadId: string): Promise<void> {
  const threads = await loadWatchedThreads();
  await saveWatchedThreads(threads.filter((thread) => thread.threadId !== threadId));
}

export async function updateWatchedThread(thread: EmailWatch): Promise<void> {
  const threads = await loadWatchedThreads();
  const next = threads.filter((entry) => entry.threadId !== thread.threadId);
  next.push(thread);
  await saveWatchedThreads(next);
}

export async function loadLastEmailThread(): Promise<LastThreadState> {
  try {
    const raw = await fs.readFile(lastThreadFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<LastThreadState>;
    return {
      threadId: parsed.threadId ?? null,
      subject: parsed.subject ?? null,
    };
  } catch {
    return { threadId: null, subject: null };
  }
}

export async function saveLastEmailThread(summary: Pick<EmailSummaryItem, "threadId" | "subject">): Promise<void> {
  await ensureEmailStateDir();
  await fs.writeFile(
    lastThreadFile,
    JSON.stringify({ threadId: summary.threadId, subject: summary.subject }, null, 2),
    "utf-8"
  );
}

export async function loadInboxMonitorState(): Promise<InboxMonitorState> {
  try {
    const raw = await fs.readFile(inboxMonitorFile, "utf-8");
    const parsed = JSON.parse(raw) as Partial<InboxMonitorState>;
    return {
      notifyJid: parsed.notifyJid ?? null,
      notifiedMessageIds: Array.isArray(parsed.notifiedMessageIds)
        ? parsed.notifiedMessageIds.filter((value): value is string => typeof value === "string")
        : [],
      lastCheckedAt: parsed.lastCheckedAt ?? null,
    };
  } catch {
    return {
      notifyJid: null,
      notifiedMessageIds: [],
      lastCheckedAt: null,
    };
  }
}

export async function saveInboxMonitorState(state: InboxMonitorState): Promise<void> {
  await ensureEmailStateDir();
  await fs.writeFile(inboxMonitorFile, JSON.stringify(state, null, 2), "utf-8");
}
