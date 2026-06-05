import test from "node:test";
import assert from "node:assert/strict";
import { planMessage } from "../../src/planner/claude";
import { Session, UserPreferences } from "../../src/types/grocery";

function makeSession(): Session {
  return {
    jid: "15555550123@s.whatsapp.net",
    pendingConfirmation: false,
    pendingCart: null,
    lastEmailThreadId: null,
    lastMessageAt: new Date().toISOString(),
    lastSummary: null,
  };
}

function makePrefs(): UserPreferences {
  return {
    organicPreference: true,
    organicCategories: ["dairy", "eggs", "meat"],
    deliveryPreference: "delivery",
    substitutionPolicy: "allow",
    maxOrderTotalUSD: 500,
    brands: {},
    sizes: {},
    itemDefaults: {},
    avoid: [],
  };
}

test("calendar requests are parsed deterministically into calendar actions", async () => {
  const action = await planMessage(
    "put dinner with Harry on the calendar for Friday at 7pm",
    makeSession(),
    makePrefs()
  );

  assert.equal(action.action, "create_calendar_event");
  assert.equal(action.calendarEvent?.title, "dinner with Harry");
  assert.equal(action.items.length, 0);
  assert.equal(action.confirmed, false);
  assert.ok(action.calendarEvent?.startIso);
  assert.ok(action.calendarEvent?.endIso);
});

test("plain add commands stay on the grocery path", async () => {
  const action = await planMessage("add yogurt", makeSession(), makePrefs());

  assert.equal(action.action, "add_items");
  assert.equal(action.calendarEvent, null);
  assert.equal(action.items[0]?.name, "yogurt");
});

test("calendar titles drop filler words like 'something' and keep the real event name", async () => {
  const action = await planMessage(
    "Put something in the calendar for GD arriving at 2pm on Tuesday",
    makeSession(),
    makePrefs()
  );

  assert.equal(action.action, "create_calendar_event");
  assert.equal(action.calendarEvent?.title, "GD arriving");
});

test("calendar requests include mentioned email attendees as well as defaults", async () => {
  const action = await planMessage(
    "Put dinner with Harry on the calendar for Friday at 7pm and invite harry@example.com",
    makeSession(),
    makePrefs()
  );

  assert.equal(action.action, "create_calendar_event");
  assert.ok(action.calendarEvent?.attendees.includes("harry@example.com"));
  assert.ok(action.calendarEvent?.attendees.includes("alex@example.com"));
  assert.ok(action.calendarEvent?.attendees.includes("casey@example.com"));
});
