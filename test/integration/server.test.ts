import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { buildGreetingReply, buildGroupOnboardingReply, buildHelpReply, createApp } from "../../src/app/server";
import { extractGroupOnboardingName, isGreetingRequest, isHelpRequest } from "../../src/planner/rules";
import { normalizeTarget } from "../../src/channels/whatsapp";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("provider path returns an immediate ack and delivers the final reply in the background", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];

  const app = createApp({
    processMessage: async (jid, text) => {
      assert.equal(jid, "15555550123@s.whatsapp.net");
      assert.equal(text, "what's in my cart?");
      await sleep(50);
      return "Cart (2 items):\n• Organic Eggs\n• Organic Whole Milk";
    },
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "main",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Conversation info (untrusted metadata):\n```json\n{\n  \"message_id\": \"test-ack\",\n  \"sender_id\": \"+15555550123\",\n  \"sender\": \"Alex\",\n  \"timestamp\": \"Sat 2026-04-18 10:51 PDT\"\n}\n```\n\nwhat's in my cart?",
              },
            ],
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as any;
    const ack = json.choices?.[0]?.message?.content;

    assert.ok(typeof ack === "string");
    assert.match(
      ack,
      /Got it\.|On it\.|I.?m on it\.|Working on it now\./
    );
    assert.equal(sentReplies.length, 0);

    for (let i = 0; i < 20 && sentReplies.length === 0; i += 1) {
      await sleep(20);
    }

    assert.equal(sentReplies.length, 1);
    assert.equal(sentReplies[0]?.jid, "15555550123@s.whatsapp.net");
    assert.equal(
      sentReplies[0]?.text,
      "Cart (2 items):\n• Organic Eggs\n• Organic Whole Milk"
    );
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("provider path ignores side conversation in a group chat unless Rocky is addressed", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  const processed: Array<{ jid: string; text: string }> = [];

  const app = createApp({
    processMessage: async (jid, text) => {
      processed.push({ jid, text });
      return "This should not be sent";
    },
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "main",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Conversation info (untrusted metadata):\n```json\n{\n  \"message_id\": \"group-ignore\",\n  \"sender_id\": \"+15555550123\",\n  \"sender\": \"Alex\",\n  \"conversation_id\": \"120363400000000001@g.us\",\n  \"conversation_type\": \"group\",\n  \"timestamp\": \"Sat 2026-04-18 11:20 PDT\"\n}\n```\n\nshould we send this now?",
              },
            ],
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as any;
    assert.equal(json.choices?.[0]?.message?.content, "");
    await sleep(50);
    assert.equal(processed.length, 0);
    assert.equal(sentReplies.length, 0);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("provider path strips Rocky prefix and replies into the group chat", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  const processed: Array<{ jid: string; text: string }> = [];

  const app = createApp({
    processMessage: async (jid, text) => {
      processed.push({ jid, text });
      await sleep(20);
      return "Added: organic eggs.";
    },
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "main",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Conversation info (untrusted metadata):\n```json\n{\n  \"message_id\": \"group-rocky\",\n  \"sender_id\": \"+15555550123\",\n  \"sender\": \"Alex\",\n  \"conversation_id\": \"120363400000000001@g.us\",\n  \"conversation_type\": \"group\",\n  \"timestamp\": \"Sat 2026-04-18 11:21 PDT\"\n}\n```\n\nRocky, add eggs",
              },
            ],
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as any;
    const ack = json.choices?.[0]?.message?.content;
    assert.match(ack, /Got it\.|On it\.|I.?m on it\.|Working on it now\./);

    for (let i = 0; i < 20 && sentReplies.length === 0; i += 1) {
      await sleep(20);
    }

    assert.deepEqual(processed, [{ jid: "120363400000000001@g.us", text: "add eggs" }]);
    assert.deepEqual(sentReplies, [{ jid: "120363400000000001@g.us", text: "Added: organic eggs." }]);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("provider path uses conversation_label to reply into a group chat", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  const processed: Array<{ jid: string; text: string }> = [];

  const app = createApp({
    processMessage: async (jid, text) => {
      processed.push({ jid, text });
      await sleep(20);
      return "Cart (1 item):\n• Organic Eggs";
    },
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "main",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Conversation info (untrusted metadata):\n```json\n{\n  \"message_id\": \"group-label\",\n  \"sender_id\": \"+15555550123\",\n  \"conversation_label\": \"120363499999999999@g.us\",\n  \"sender\": \"Alex\",\n  \"timestamp\": \"Sat 2026-04-18 18:46 PDT\"\n}\n```\n\nRocky what's in the cart?",
              },
            ],
          },
        ],
      }),
    });

    assert.equal(response.status, 200);

    for (let i = 0; i < 20 && sentReplies.length === 0; i += 1) {
      await sleep(20);
    }

    assert.deepEqual(processed, [{ jid: "120363499999999999@g.us", text: "what's in the cart?" }]);
    assert.deepEqual(sentReplies, [{ jid: "120363499999999999@g.us", text: "Cart (1 item):\n• Organic Eggs" }]);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("help requests are handled locally without falling through to the planner", () => {
  assert.equal(isHelpRequest("What can you do"), true);
  assert.equal(isHelpRequest("help"), true);
  assert.equal(isHelpRequest("add yogurt"), false);
  assert.match(buildHelpReply(), /best family assistant you've ever had/i);
  assert.match(buildHelpReply(), /add yogurt/);
});

test("greeting requests are handled locally in DM", async () => {
  assert.equal(isGreetingRequest("hey"), true);
  assert.equal(isGreetingRequest("hello"), true);
  assert.equal(isGreetingRequest("what's in my cart"), false);
  assert.match(buildGreetingReply(), /I'm here if you need me to take care of something/i);

  const sentReplies: Array<{ jid: string; text: string }> = [];
  const app = createApp({
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "main",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Conversation info (untrusted metadata):\n```json\n{\n  \"message_id\": \"dm-hey\",\n  \"sender_id\": \"+15555550123\",\n  \"sender\": \"Alex\",\n  \"timestamp\": \"Tue 2026-04-22 13:06 PDT\"\n}\n```\n\nHey",
              },
            ],
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as any;
    assert.match(json.choices?.[0]?.message?.content, /Got it, I'm on it\./);

    for (let i = 0; i < 20 && sentReplies.length === 0; i += 1) {
      await sleep(20);
    }

    assert.deepEqual(sentReplies, [
      {
        jid: "15555550123@s.whatsapp.net",
        text: "Hey. I'm here if you need me to take care of something.",
      },
    ]);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("whatsapp target normalization preserves group JIDs and formats direct JIDs", () => {
  assert.equal(normalizeTarget("120363499999999999@g.us"), "120363499999999999@g.us");
  assert.equal(normalizeTarget("15555550123@s.whatsapp.net"), "+15555550123");
  assert.equal(normalizeTarget("+15555550123"), "+15555550123");
});

test("group onboarding messages get a warm bounded reply", async () => {
  assert.equal(
    extractGroupOnboardingName("Hi Rocky, we're adding Harry to the group chat too"),
    "Harry"
  );
  assert.match(buildGroupOnboardingReply("Harry"), /welcome Harry/i);
  assert.match(buildGroupOnboardingReply("Harry"), /groceries, reminders/i);
});

test("calendar requests work through the DM provider path with a mocked executor reply", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  const processed: Array<{ jid: string; text: string }> = [];

  const app = createApp({
    processMessage: async (jid, text) => {
      processed.push({ jid, text });
      await sleep(20);
      return 'Got it — I put "dinner with Harry" on the calendar for Fri, Apr 24 at 7:00 PM.\n\nI invited alex@example.com and casey@example.com too.';
    },
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "main",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Conversation info (untrusted metadata):\n```json\n{\n  \"message_id\": \"calendar-dm\",\n  \"sender_id\": \"+15555550123\",\n  \"sender\": \"Alex\",\n  \"timestamp\": \"Sun 2026-04-19 08:41 PDT\"\n}\n```\n\nPut dinner with Harry on the calendar for Friday at 7pm",
              },
            ],
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as any;
    assert.match(json.choices?.[0]?.message?.content, /Got it, I'm on it\./);

    for (let i = 0; i < 20 && sentReplies.length === 0; i += 1) {
      await sleep(20);
    }

    assert.deepEqual(processed, [
      {
        jid: "15555550123@s.whatsapp.net",
        text: "Put dinner with Harry on the calendar for Friday at 7pm",
      },
    ]);
    assert.match(sentReplies[0]?.text ?? "", /put "dinner with Harry" on the calendar/i);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("email requests work through the DM provider path with a mocked executor reply", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  const processed: Array<{ jid: string; text: string }> = [];

  const app = createApp({
    processMessage: async (jid, text) => {
      processed.push({ jid, text });
      await sleep(20);
      return "Got it — I emailed harry@example.com.";
    },
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "main",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Conversation info (untrusted metadata):\n```json\n{\n  \"message_id\": \"email-dm\",\n  \"sender_id\": \"+15555550123\",\n  \"sender\": \"Alex\",\n  \"timestamp\": \"Tue 2026-04-22 13:40 PDT\"\n}\n```\n\nemail Harry and ask if Friday at 7 works",
              },
            ],
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as any;
    assert.match(json.choices?.[0]?.message?.content, /Got it, I'm on it\./);

    for (let i = 0; i < 20 && sentReplies.length === 0; i += 1) {
      await sleep(20);
    }

    assert.deepEqual(processed, [
      {
        jid: "15555550123@s.whatsapp.net",
        text: "email Harry and ask if Friday at 7 works",
      },
    ]);
    assert.match(sentReplies[0]?.text ?? "", /I emailed harry@example.com/i);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("calendar requests work through the group provider path with Rocky addressing", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  const processed: Array<{ jid: string; text: string }> = [];

  const app = createApp({
    processMessage: async (jid, text) => {
      processed.push({ jid, text });
      await sleep(20);
      return 'Got it — I put "dinner with Harry" on the calendar for Fri, Apr 24 at 7:00 PM.';
    },
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "main",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Conversation info (untrusted metadata):\n```json\n{\n  \"message_id\": \"calendar-group\",\n  \"sender_id\": \"+15555550123\",\n  \"conversation_label\": \"120363499999999999@g.us\",\n  \"sender\": \"Alex\",\n  \"timestamp\": \"Sun 2026-04-19 08:42 PDT\"\n}\n```\n\nRocky, put dinner with Harry on the calendar for Friday at 7pm",
              },
            ],
          },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const json = (await response.json()) as any;
    assert.match(json.choices?.[0]?.message?.content, /Got it, I'm on it\./);

    for (let i = 0; i < 20 && sentReplies.length === 0; i += 1) {
      await sleep(20);
    }

    assert.deepEqual(processed, [
      {
        jid: "120363499999999999@g.us",
        text: "put dinner with Harry on the calendar for Friday at 7pm",
      },
    ]);
    assert.equal(sentReplies[0]?.jid, "120363499999999999@g.us");
    assert.match(sentReplies[0]?.text ?? "", /put "dinner with Harry" on the calendar/i);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("group confirm order is treated as an explicit command even without Rocky prefix", async () => {
  const sentReplies: Array<{ jid: string; text: string }> = [];
  const processed: Array<{ jid: string; text: string }> = [];

  const app = createApp({
    processMessage: async (jid, text) => {
      processed.push({ jid, text });
      await sleep(20);
      return "Order confirmed.";
    },
    sendReply: async (jid, text) => {
      sentReplies.push({ jid, text });
    },
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "main",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Conversation info (untrusted metadata):\n```json\n{\n  \"message_id\": \"group-confirm\",\n  \"sender_id\": \"+15555550123\",\n  \"conversation_label\": \"120363499999999999@g.us\",\n  \"sender\": \"Alex\",\n  \"timestamp\": \"Sun 2026-04-19 15:24 PDT\"\n}\n```\n\nConfirm order",
              },
            ],
          },
        ],
      }),
    });

    assert.equal(response.status, 200);

    for (let i = 0; i < 20 && sentReplies.length === 0; i += 1) {
      await sleep(20);
    }

    assert.deepEqual(processed, [{ jid: "120363499999999999@g.us", text: "Confirm order" }]);
    assert.deepEqual(sentReplies, [{ jid: "120363499999999999@g.us", text: "Order confirmed." }]);
  } finally {
    server.close();
    await once(server, "close");
  }
});
