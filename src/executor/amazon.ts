import { GroceryAction, GroceryItem, Session, UserPreferences, ExecutorResult } from "../types/grocery";
import { executorLogger } from "../util/logging";
import { getPage } from "./browser";
import { addItemToCart, removeItemFromCart, readCart, formatCartSummary } from "./cart";
import { placeOrder } from "./checkout";
import { createCalendarEvent } from "./calendar";
import { executeEmailAction } from "./email";

export async function executeAction(
  action: GroceryAction,
  session: Session,
  prefs: UserPreferences
): Promise<ExecutorResult> {
  executorLogger.info("Executing action", { action: action.action });

  switch (action.action) {
    case "add_items":
      return executeAddItems(action, prefs);

    case "remove_items":
      return executeRemoveItems(action);

    case "view_cart":
      return executeViewCart();

    case "review_cart":
      return executeReviewCart();

    case "create_calendar_event":
      return executeCalendarEvent(action);

    case "send_email":
    case "reply_email":
    case "summarize_inbox":
    case "watch_email_thread":
    case "unwatch_email_thread":
    case "summarize_email_thread":
      return executeEmailAction(action.action, action.email, session);

    case "checkout":
      return executeCheckout(session);

    default:
      return {
        status: "error",
        message: `Unknown action: ${action.action}`,
        cart: null,
      };
  }
}

async function executeCalendarEvent(action: GroceryAction): Promise<ExecutorResult> {
  if (!action.calendarEvent) {
    return {
      status: "error",
      message: "I had the idea for the event, but I couldn't work out the details. Try saying it a different way.",
      cart: null,
    };
  }

  return createCalendarEvent(action.calendarEvent);
}

async function executeAddItems(
  action: GroceryAction,
  prefs: UserPreferences
): Promise<ExecutorResult> {
  const page = await getPage();
  const results: Array<{ added: boolean; name: string; notes: string | null }> = [];

  for (const item of action.items) {
    try {
      const result = await addItemToCart(page, item, prefs);
      results.push(result);
    } catch (err) {
      executorLogger.error("Error adding item", { item: item.name, err: String(err) });
      results.push({ added: false, name: item.name, notes: String(err) });
    }
  }

  const cart = await readCart(page).catch(() => null);

  const addedItems = action.items.filter((_, index) => results[index]?.added);
  const failed = results.filter((r) => !r.added);
  const details = addedItems.map(describeRequestedItem);
  const lines: string[] = [];
  if (details.length > 0) {
    lines.push(`Got it — I added ${details.join(", ")}.`);
  }
  if (failed.length > 0) {
    const failedNames = failed.map((r) => `${r.name} (${r.notes ?? "not found"})`);
    lines.push(`I couldn't add ${failedNames.join(", ")}.`);
  }
  if (cart) {
    lines.push(`Right now you've got ${cart.itemCount} item${cart.itemCount !== 1 ? "s" : ""} in the cart.`);
    if (cart.estimatedTotal != null) {
      lines.push(`Estimated total: $${cart.estimatedTotal.toFixed(2)}.`);
    }
  }
  lines.push("Say \"what's in my cart?\" if you want the full list.");

  return { status: "ok", message: lines.join("\n\n").trim(), cart };
}

async function executeRemoveItems(action: GroceryAction): Promise<ExecutorResult> {
  const page = await getPage();
  const results: Array<{ removed: boolean; name: string; matchedName: string | null }> = [];

  for (const item of action.items) {
    try {
      const result = await removeItemFromCart(page, item);
      results.push(result);
    } catch (err) {
      executorLogger.error("Error removing item", { item: item.name, err: String(err) });
      results.push({ removed: false, name: item.name, matchedName: null });
    }
  }

  const cart = await readCart(page).catch(() => null);

  const removed = results.filter((r) => r.removed).map((r) => r.matchedName ?? r.name);
  const notRemoved = results.filter((r) => !r.removed);

  const lines: string[] = [];
  if (removed.length > 0) lines.push(`Got it — I removed ${removed.join(", ")}.`);
  if (notRemoved.length > 0) {
    const labels = notRemoved.map((r) => r.matchedName ?? r.name);
    lines.push(`I couldn't remove ${labels.join(", ")}.`);
  }
  if (cart) {
    lines.push(`Right now you've got ${cart.itemCount} item${cart.itemCount !== 1 ? "s" : ""} in the cart.`);
    if (cart.estimatedTotal != null) {
      lines.push(`Estimated total: $${cart.estimatedTotal.toFixed(2)}.`);
    }
  }
  lines.push("Say \"what's in my cart?\" if you want the full list.");

  return { status: "ok", message: lines.join("\n\n").trim(), cart };
}

async function executeViewCart(): Promise<ExecutorResult> {
  const page = await getPage();
  executorLogger.info("Refreshing cart from Amazon for view_cart");
  const cart = await readCart(page);

  const summary = formatCartSummary(cart);
  return {
    status: "ok",
    message: `Fresh cart review (${cart.itemCount} item${cart.itemCount !== 1 ? "s" : ""}):\n${summary}`,
    cart,
  };
}

async function executeReviewCart(): Promise<ExecutorResult> {
  const page = await getPage();
  executorLogger.info("Refreshing cart from Amazon for review_cart");
  const cart = await readCart(page);

  const summary = formatCartSummary(cart);
  const msg =
    `Fresh full cart review (${cart.itemCount} item${cart.itemCount !== 1 ? "s" : ""}):\n` +
    summary +
    "\n\nTo place this order, reply \"place order\".";

  return { status: "ok", message: msg, cart };
}

async function executeCheckout(session: Session): Promise<ExecutorResult> {
  const page = await getPage();
  const result = await placeOrder(page);

  const cart = await readCart(page).catch(() => null);

  return {
    status: result.success ? "ok" : "blocked",
    message: result.message,
    cart,
    blockedReason: result.success ? undefined : "checkout_stopped",
  };
}

function describeRequestedItem(item: GroceryItem): string {
  const parts: string[] = [];
  if (item.quantity > 1) {
    parts.push(String(item.quantity));
  }
  if (item.unit) {
    parts.push(item.unit);
  }
  parts.push(item.name);
  return parts.join(" ");
}
