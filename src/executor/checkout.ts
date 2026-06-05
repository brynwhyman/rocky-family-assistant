import { Page } from "playwright";
import { CartSummary } from "../types/grocery";
import { executorLogger } from "../util/logging";
import { config } from "../app/config";
import { detectPageState } from "./browser";
import { readCart } from "./cart";

// ── Checkout — ALWAYS requires confirmed: true from guardrails ─────────────────
//
// This function only proceeds past the cart page if explicitly called from
// amazon.ts after a confirmed=true action has passed guardrails.

export interface CheckoutResult {
  success: boolean;
  orderNumber: string | null;
  message: string;
}

export async function placeOrder(page: Page): Promise<CheckoutResult> {
  executorLogger.info("Starting checkout flow");

  // Navigate to cart first to verify state
  await page.goto(`${config.amazon.baseUrl}/gp/cart/view.html`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  let state = await detectPageState(page);
  if (state !== "normal") {
    return {
      success: false,
      orderNumber: null,
      message: `Checkout stopped — unexpected page state: ${state}. Please check Amazon manually.`,
    };
  }

  // Read cart one final time to log it
  const cart = await readCart(page).catch(() => null);
  if (cart) {
    executorLogger.info("Cart at checkout", {
      itemCount: cart.itemCount,
      total: cart.estimatedTotal,
    });
  }

  // Click "Proceed to checkout"
  const proceedBtn = await page.$(
    "#sc-buy-box-ptc-button input, #hlb-ptc-btn-native, [name='proceedToRetailCheckout']"
  );
  if (!proceedBtn) {
    return {
      success: false,
      orderNumber: null,
      message: "Checkout stopped — could not find 'Proceed to checkout' button. Check Amazon manually.",
    };
  }

  await proceedBtn.click();
  await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });

  state = await detectPageState(page);
  if (state !== "normal") {
    executorLogger.warn("Blocked during checkout", { state });
    return {
      success: false,
      orderNumber: null,
      message: `Checkout stopped at ${state} page. Manual action required.`,
    };
  }

  // Check if we're on a delivery / review page — stop here and ask for confirmation
  // to avoid auto-clicking through payment
  const url = page.url();
  if (url.includes("/checkout/")) {
    executorLogger.info("Reached checkout page — stopping for safety", { url });
    return {
      success: false,
      orderNumber: null,
      message:
        "Reached the Amazon checkout page. I stopped here for safety. " +
        "Please complete the final payment step yourself at: " +
        url,
    };
  }

  return {
    success: false,
    orderNumber: null,
    message: "Checkout reached an unexpected state. Please finish manually.",
  };
}
