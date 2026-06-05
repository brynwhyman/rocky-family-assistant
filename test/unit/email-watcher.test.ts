import test from "node:test";
import assert from "node:assert/strict";
import { pollInbox, pollWatchedThreads } from "../../src/email/watcher";
import { Session } from "../../src/types/grocery";

function makeSession(): Session {
  return {
    jid: "15555550123@s.whatsapp.net",
    pendingConfirmation: false,
    pendingCart: null,
    lastEmailThreadId: null,
    lastMessageAt: "2026-04-22T20:00:00.000Z",
    lastSummary: null,
  };
}

test("watcher notifies on new external thread replies and updates context", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  const savedSessions: Session[] = [];
  const savedLastThreads: Array<{ threadId: string; subject: string }> = [];
  let savedWatches: any[] = [];

  await pollWatchedThreads({
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
    loadWatches: async () => [
      {
        threadId: "thread-123",
        label: "Dinner on Friday?",
        createdAt: "2026-04-22T19:00:00.000Z",
        notifyJid: "15555550123@s.whatsapp.net",
        lastSeenMessageId: "m1",
        lastNotifiedMessageId: null,
      },
    ],
    saveWatches: async (watches) => {
      savedWatches = watches;
    },
    loadEmailSession: async () => makeSession(),
    saveEmailSession: async (session) => {
      savedSessions.push(session);
    },
    saveLastThread: async (summary) => {
      savedLastThreads.push(summary);
    },
    getAccessToken: async () => "token",
    getProfile: async () => ({ emailAddress: "rocky@example.com" }),
    getThread: async () => ({
      id: "thread-123",
      messages: [
        {
          id: "m1",
          threadId: "thread-123",
          snippet: "Would Friday work?",
          payload: {
            headers: [
              { name: "From", value: "rocky@example.com" },
              { name: "Subject", value: "Dinner on Friday?" },
            ],
          },
        },
        {
          id: "m2",
          threadId: "thread-123",
          snippet: "Friday at 7 works for me",
          labelIds: ["UNREAD", "INBOX"],
          payload: {
            headers: [
              { name: "From", value: "Harry <harry@example.com>" },
              { name: "Subject", value: "Dinner on Friday?" },
            ],
          },
        },
      ],
    }),
  });

  assert.deepEqual(sentReplies, [
    {
      jid: "15555550123@s.whatsapp.net",
      text: "Harry replied — Friday at 7 works for me\n\nIf you want, I can reply from here.",
    },
  ]);
  assert.equal(savedSessions[0]?.lastEmailThreadId, "thread-123");
  assert.equal(savedLastThreads[0]?.threadId, "thread-123");
  assert.equal(savedWatches[0]?.lastSeenMessageId, "m2");
  assert.equal(savedWatches[0]?.lastNotifiedMessageId, "m2");
});

test("watcher ignores Rocky's own sent emails when polling", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  let savedWatches: any[] = [];

  await pollWatchedThreads({
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
    loadWatches: async () => [
      {
        threadId: "thread-123",
        label: "Dinner on Friday?",
        createdAt: "2026-04-22T19:00:00.000Z",
        notifyJid: "15555550123@s.whatsapp.net",
        lastSeenMessageId: "m1",
        lastNotifiedMessageId: null,
      },
    ],
    saveWatches: async (watches) => {
      savedWatches = watches;
    },
    loadEmailSession: async () => makeSession(),
    saveEmailSession: async () => undefined,
    saveLastThread: async () => undefined,
    getAccessToken: async () => "token",
    getProfile: async () => ({ emailAddress: "rocky@example.com" }),
    getThread: async () => ({
      id: "thread-123",
      messages: [
        {
          id: "m1",
          threadId: "thread-123",
          snippet: "Would Friday work?",
          payload: {
            headers: [
              { name: "From", value: "harry@example.com" },
              { name: "Subject", value: "Dinner on Friday?" },
            ],
          },
        },
        {
          id: "m2",
          threadId: "thread-123",
          snippet: "Tuesday works for Alex",
          payload: {
            headers: [
              { name: "From", value: "rocky@example.com" },
              { name: "Subject", value: "Dinner on Friday?" },
            ],
          },
        },
      ],
    }),
  });

  assert.equal(sentReplies.length, 0);
  assert.equal(savedWatches[0]?.lastSeenMessageId, "m2");
});

test("inbox watcher notifies on new unread inbox mail and remembers the DM target", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  const savedSessions: Session[] = [];
  const savedLastThreads: Array<{ threadId: string; subject: string }> = [];
  const savedInboxStates: any[] = [];

  await pollInbox({
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
    loadInboxState: async () => ({
      notifyJid: null,
      notifiedMessageIds: [],
      lastCheckedAt: null,
    }),
    saveInboxState: async (state) => {
      savedInboxStates.push(state);
    },
    listEmailSessions: async () => [
      {
        jid: "120363499999999999@g.us",
        lastMessageAt: "2026-04-23T07:00:00.000Z",
      },
      {
        jid: "15555550123@s.whatsapp.net",
        lastMessageAt: "2026-04-23T07:30:00.000Z",
      },
    ] as any,
    loadEmailSession: async () => makeSession(),
    saveEmailSession: async (session) => {
      savedSessions.push(session);
    },
    saveLastThread: async (summary) => {
      savedLastThreads.push(summary);
    },
    getAccessToken: async () => "token",
    getProfile: async () => ({ emailAddress: "rocky@example.com" }),
    listMessages: async () => [{ id: "m10", threadId: "thread-10" }],
    getMessage: async () => ({
      id: "m10",
      threadId: "thread-10",
      snippet: "Friday at 7 works for me On Wed, 22 Apr 2026 at 10:02 PM, rocky@example.com wrote:",
      labelIds: ["UNREAD", "INBOX"],
      payload: {
        headers: [
          { name: "From", value: "Harry <harry@example.com>" },
          { name: "Subject", value: "Dinner on Friday?" },
        ],
      },
    }),
  });

  assert.deepEqual(sentReplies, [
    {
      jid: "15555550123@s.whatsapp.net",
      text: 'New email from Harry — "Dinner on Friday?".\nFriday at 7 works for me\n\nIf you want, I can reply from here.',
    },
  ]);
  assert.equal(savedSessions[0]?.lastEmailThreadId, "thread-10");
  assert.equal(savedLastThreads[0]?.threadId, "thread-10");
  assert.equal(savedInboxStates.at(-1)?.notifyJid, "15555550123@s.whatsapp.net");
  assert.deepEqual(savedInboxStates.at(-1)?.notifiedMessageIds, ["m10"]);
});

test("inbox watcher does not re-notify already seen unread mail", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  let savedInboxState: any = null;

  await pollInbox({
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
    loadInboxState: async () => ({
      notifyJid: "15555550123@s.whatsapp.net",
      notifiedMessageIds: ["m10"],
      lastCheckedAt: null,
    }),
    saveInboxState: async (state) => {
      savedInboxState = state;
    },
    listEmailSessions: async () => [] as any,
    loadEmailSession: async () => makeSession(),
    saveEmailSession: async () => undefined,
    saveLastThread: async () => undefined,
    getAccessToken: async () => "token",
    getProfile: async () => ({ emailAddress: "rocky@example.com" }),
    listMessages: async () => [{ id: "m10", threadId: "thread-10" }],
    getMessage: async () => ({
      id: "m10",
      threadId: "thread-10",
      snippet: "Friday at 7 works for me",
      labelIds: ["UNREAD", "INBOX"],
      payload: {
        headers: [
          { name: "From", value: "Harry <harry@example.com>" },
          { name: "Subject", value: "Dinner on Friday?" },
        ],
      },
    }),
  });

  assert.equal(sentReplies.length, 0);
  assert.equal(savedInboxState.notifyJid, "15555550123@s.whatsapp.net");
  assert.deepEqual(savedInboxState.notifiedMessageIds, ["m10"]);
});
