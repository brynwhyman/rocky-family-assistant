import test from "node:test";
import assert from "node:assert/strict";
import { parseEmailAction } from "../../src/planner/email";
import { EmailContact, Session } from "../../src/types/grocery";

function makeSession(): Session {
  return {
    jid: "15555550123@s.whatsapp.net",
    pendingConfirmation: false,
    pendingCart: null,
    lastEmailThreadId: "thread-123",
    lastMessageAt: new Date().toISOString(),
    lastSummary: null,
  };
}

const contacts: EmailContact[] = [
  { name: "Harry", email: "harry@example.com" },
  { name: "Julia", email: "casey@example.com" },
];

test("send email requests parse deterministically", () => {
  const action = parseEmailAction("email Harry and ask if Friday at 7 works", makeSession(), contacts);
  assert.equal(action?.action, "send_email");
  assert.equal(action?.email?.contactQuery, "Harry");
  assert.equal(action?.email?.body, "If Friday at 7 works");
});

test("send email requests can include an inline email address cleanly", () => {
  const action = parseEmailAction(
    "email Harry at harry@example.com and ask if Friday at 7 works",
    makeSession(),
    contacts
  );
  assert.equal(action?.action, "send_email");
  assert.equal(action?.email?.contactQuery, "Harry");
  assert.deepEqual(action?.email?.to, ["harry@example.com"]);
});

test("contact save requests parse deterministically", () => {
  const action = parseEmailAction("Harry's email is harry@example.com", makeSession(), contacts);
  assert.equal(action?.action, "save_email_contact");
  assert.equal(action?.email?.contactQuery, "Harry");
  assert.deepEqual(action?.email?.to, ["harry@example.com"]);
});

test("reply email requests target the last known thread", () => {
  const action = parseEmailAction("reply that Tuesday works for us", makeSession(), contacts);
  assert.equal(action?.action, "reply_email");
  assert.equal(action?.email?.threadId, "thread-123");
  assert.equal(action?.email?.body, "Tuesday works for us");
});

test("summarize inbox requests can filter by contact", () => {
  const action = parseEmailAction("show me unread emails from Harry", makeSession(), contacts);
  assert.equal(action?.action, "summarize_inbox");
  assert.equal(action?.email?.filter, "harry@example.com");
});

test("watch thread requests use the last known thread", () => {
  const action = parseEmailAction("keep an eye on that thread", makeSession(), contacts);
  assert.equal(action?.action, "watch_email_thread");
  assert.equal(action?.email?.threadId, "thread-123");
});
