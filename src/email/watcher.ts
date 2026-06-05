import { config } from "../app/config";
import { appLogger } from "../util/logging";
import { listSessions, loadSession, saveSession } from "../memory/history";
import {
  loadInboxMonitorState,
  loadLastEmailThread,
  loadWatchedThreads,
  saveInboxMonitorState,
  saveLastEmailThread,
  saveWatchedThreads,
} from "../memory/email";
import { sendReply as sendWhatsAppReply } from "../channels/whatsapp";
import { EmailWatch } from "../types/grocery";
import {
  extractEmailAddress,
  gmailGetMessage,
  gmailListMessages,
  gmailGetProfile,
  gmailGetThread,
  getGoogleEmailAccessToken,
  toEmailSummaryItem,
} from "../executor/gmail";
import { buildInboxEmailNotification, buildWatchedThreadNotification } from "../executor/email-tone";

type WatcherDeps = {
  sendReply?: (jid: string, text: string) => Promise<void>;
  now?: () => Date;
  loadWatches?: typeof loadWatchedThreads;
  saveWatches?: typeof saveWatchedThreads;
  loadEmailSession?: typeof loadSession;
  saveEmailSession?: typeof saveSession;
  saveLastThread?: typeof saveLastEmailThread;
  loadInboxState?: typeof loadInboxMonitorState;
  saveInboxState?: typeof saveInboxMonitorState;
  listEmailSessions?: typeof listSessions;
  getAccessToken?: typeof getGoogleEmailAccessToken;
  getProfile?: typeof gmailGetProfile;
  listMessages?: typeof gmailListMessages;
  getMessage?: typeof gmailGetMessage;
  getThread?: typeof gmailGetThread;
};

let watcherTimer: NodeJS.Timeout | null = null;
let watcherBusy = false;

export function startEmailWatcher(deps: WatcherDeps = {}): () => void {
  if (!config.googleEmail.enabled) {
    appLogger.info("Email watcher disabled", { reason: "gmail_not_configured" });
    return () => undefined;
  }

  if (watcherTimer) {
    clearInterval(watcherTimer);
    watcherTimer = null;
  }

  const run = async () => {
    if (watcherBusy) return;
    watcherBusy = true;
    try {
      await pollInbox(deps);
      await pollWatchedThreads(deps);
    } catch (err) {
      appLogger.error("Email watcher cycle failed", { err: String(err) });
    } finally {
      watcherBusy = false;
    }
  };

  watcherTimer = setInterval(() => {
    void run();
  }, config.googleEmail.watcherIntervalMs);

  void run();

  appLogger.info("Email watcher started", {
    intervalMs: config.googleEmail.watcherIntervalMs,
  });

  return () => {
    if (watcherTimer) {
      clearInterval(watcherTimer);
      watcherTimer = null;
      appLogger.info("Email watcher stopped");
    }
  };
}

export async function pollInbox(deps: WatcherDeps = {}): Promise<void> {
  const sendReply = deps.sendReply ?? sendWhatsAppReply;
  const now = deps.now ?? (() => new Date());
  const loadEmailSession = deps.loadEmailSession ?? loadSession;
  const saveEmailSession = deps.saveEmailSession ?? saveSession;
  const saveLastThread = deps.saveLastThread ?? saveLastEmailThread;
  const loadInboxState = deps.loadInboxState ?? loadInboxMonitorState;
  const saveInboxState = deps.saveInboxState ?? saveInboxMonitorState;
  const listEmailSessions = deps.listEmailSessions ?? listSessions;
  const getAccessToken = deps.getAccessToken ?? getGoogleEmailAccessToken;
  const getProfile = deps.getProfile ?? gmailGetProfile;
  const listMessages = deps.listMessages ?? gmailListMessages;
  const getMessage = deps.getMessage ?? gmailGetMessage;

  const accessToken = await getAccessToken();
  const profile = await getProfile(accessToken);
  const rockyEmail = profile.emailAddress.toLowerCase();
  const inboxState = await loadInboxState();
  const notifyJid = inboxState.notifyJid ?? (await resolveInboxNotifyJid(listEmailSessions));
  if (!notifyJid) {
    appLogger.info("Email inbox watcher idle", { reason: "no_notify_jid" });
    return;
  }

  const messageRefs = await listMessages(accessToken, "in:inbox is:unread", 10);
  if (messageRefs.length === 0) {
    await saveInboxState({
      notifyJid,
      notifiedMessageIds: inboxState.notifiedMessageIds.slice(-50),
      lastCheckedAt: now().toISOString(),
    });
    return;
  }

  const messages = await Promise.all(messageRefs.map((message) => getMessage(accessToken, message.id)));
  const nextNotifiedIds = new Set(inboxState.notifiedMessageIds);

  for (const message of messages.reverse()) {
    if (nextNotifiedIds.has(message.id)) continue;

    const summary = toEmailSummaryItem(message);
    const senderEmail = extractEmailAddress(summary.from)?.toLowerCase();
    if (!senderEmail || senderEmail === rockyEmail) {
      nextNotifiedIds.add(message.id);
      continue;
    }

    const notification = buildInboxEmailNotification({
      from: summary.from,
      subject: summary.subject,
      snippet: summary.snippet,
    });

    await sendReply(notifyJid, notification);

    const session = await loadEmailSession(notifyJid);
    session.lastEmailThreadId = summary.threadId;
    session.lastMessageAt = now().toISOString();
    session.lastSummary = notification;
    await saveEmailSession(session);

    await saveLastThread({
      threadId: summary.threadId,
      subject: summary.subject,
    });

    nextNotifiedIds.add(message.id);
    appLogger.info("Email inbox watcher notified", {
      notifyJid,
      from: summary.from,
      subject: summary.subject,
      threadId: summary.threadId,
    });
  }

  await saveInboxState({
    notifyJid,
    notifiedMessageIds: Array.from(nextNotifiedIds).slice(-100),
    lastCheckedAt: now().toISOString(),
  });
}

export async function pollWatchedThreads(deps: WatcherDeps = {}): Promise<void> {
  const sendReply = deps.sendReply ?? sendWhatsAppReply;
  const now = deps.now ?? (() => new Date());
  const loadWatches = deps.loadWatches ?? loadWatchedThreads;
  const saveWatches = deps.saveWatches ?? saveWatchedThreads;
  const loadEmailSession = deps.loadEmailSession ?? loadSession;
  const saveEmailSession = deps.saveEmailSession ?? saveSession;
  const saveLastThread = deps.saveLastThread ?? saveLastEmailThread;
  const getAccessToken = deps.getAccessToken ?? getGoogleEmailAccessToken;
  const getProfile = deps.getProfile ?? gmailGetProfile;
  const getThread = deps.getThread ?? gmailGetThread;

  const watches = await loadWatches();
  if (watches.length === 0) return;

  const accessToken = await getAccessToken();
  const profile = await getProfile(accessToken);
  const rockyEmail = profile.emailAddress.toLowerCase();
  const nextWatches: EmailWatch[] = [];

  for (const watch of watches) {
    try {
      const thread = await getThread(accessToken, watch.threadId);
      const messages = thread.messages ?? [];
      const latestMessage = messages.at(-1);
      if (!latestMessage) {
        nextWatches.push(watch);
        continue;
      }

      if (!watch.lastSeenMessageId) {
        nextWatches.push({
          ...watch,
          lastSeenMessageId: latestMessage.id,
        });
        continue;
      }

      const lastSeenIndex = messages.findIndex((message) => message.id === watch.lastSeenMessageId);
      const newMessages = lastSeenIndex >= 0 ? messages.slice(lastSeenIndex + 1) : messages;
      const latestId = latestMessage.id;
      if (newMessages.length === 0) {
        nextWatches.push({
          ...watch,
          lastSeenMessageId: latestId,
        });
        continue;
      }

      const externalMessages = newMessages.filter((message) => {
        const summary = toEmailSummaryItem(message);
        const senderEmail = extractEmailAddress(summary.from)?.toLowerCase();
        return Boolean(senderEmail) && senderEmail !== rockyEmail;
      });

      if (externalMessages.length === 0) {
        nextWatches.push({
          ...watch,
          lastSeenMessageId: latestId,
        });
        continue;
      }

      const newestExternal = externalMessages.at(-1)!;
      const summary = toEmailSummaryItem(newestExternal);
      const notification = buildWatchedThreadNotification({
        from: summary.from,
        subject: summary.subject,
        snippet: summary.snippet,
      });

      await sendReply(watch.notifyJid, notification);

      const session = await loadEmailSession(watch.notifyJid);
      session.lastEmailThreadId = watch.threadId;
      session.lastMessageAt = now().toISOString();
      session.lastSummary = notification;
      await saveEmailSession(session);

      await saveLastThread({
        threadId: watch.threadId,
        subject: summary.subject,
      });

      nextWatches.push({
        ...watch,
        label: summary.subject || watch.label,
        lastSeenMessageId: latestId,
        lastNotifiedMessageId: newestExternal.id,
      });

      appLogger.info("Email watcher notified", {
        threadId: watch.threadId,
        notifyJid: watch.notifyJid,
        from: summary.from,
        subject: summary.subject,
      });
    } catch (err) {
      appLogger.error("Email watcher thread check failed", {
        threadId: watch.threadId,
        notifyJid: watch.notifyJid,
        err: String(err),
      });
      nextWatches.push(watch);
    }
  }

  await saveWatches(nextWatches);

  const lastThread = await loadLastEmailThread();
  appLogger.info("Email watcher cycle complete", {
    watchedThreads: nextWatches.length,
    lastThreadId: lastThread.threadId,
  });
}

async function resolveInboxNotifyJid(
  listEmailSessions: () => Promise<Array<{ jid: string; lastMessageAt: string }>>
): Promise<string | null> {
  const sessions = await listEmailSessions();
  const directSessions = sessions
    .filter((session) => !session.jid.includes("@g.us"))
    .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt));
  return directSessions[0]?.jid ?? null;
}
