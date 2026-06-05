import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNewAssistantEmailBody,
  buildReplyAssistantEmailBody,
  buildWatchedThreadNotification,
} from "../../src/executor/email-tone";

test("new assistant emails stay in Rocky's assistant voice", () => {
  const body = buildNewAssistantEmailBody("Harry", "Would Friday at 7 work for dinner?");
  assert.match(body, /^Hi Harry,/);
  assert.match(body, /Rocky here, helping with scheduling and logistics\./);
  assert.match(body, /Would Friday at 7 work for dinner\?/);
  assert.match(body, /Thanks,\nRocky$/);
});

test("reply emails stay in Rocky's assistant voice", () => {
  const body = buildReplyAssistantEmailBody("Harry <harry@example.com>", "That works for us.");
  assert.match(body, /^Hi Harry,/);
  assert.match(body, /Rocky here, following up on behalf of the family\./);
  assert.match(body, /That works for us\./);
  assert.match(body, /Thanks,\nRocky$/);
});

test("watcher notifications are concise and action-oriented", () => {
  const notification = buildWatchedThreadNotification({
    from: "Harry <harry@example.com>",
    subject: "Dinner on Friday?",
    snippet: "Friday at 7 works for me",
  });
  assert.equal(
    notification,
    "Harry replied — Friday at 7 works for me\n\nIf you want, I can reply from here."
  );
});
