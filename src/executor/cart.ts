import { ElementHandle, Page } from "playwright";
import { CartItem, CartSummary, UserPreferences, GroceryItem } from "../types/grocery";
import { executorLogger } from "../util/logging";
import { config } from "../app/config";
import { detectPageState } from "./browser";

const DAIRY_KEYWORDS = ["milk", "cheese", "yogurt", "butter", "cream", "kefir", "half and half", "cream cheese"];
const EGG_KEYWORDS = ["egg", "eggs"];
const MEAT_KEYWORDS = ["chicken", "beef", "steak", "pork", "lamb", "turkey", "sausage", "bacon", "meat"];

export function getCartUrl(): string {
  return `${config.amazon.baseUrl}/gp/cart/view.html`;
}

export async function navigateToCart(page: Page): Promise<void> {
  await page.goto(getCartUrl(), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
}

export async function readCart(page: Page): Promise<CartSummary> {
  await navigateToCart(page);

  const state = await detectPageState(page);
  if (state !== "normal") {
    throw new Error(`Unexpected page state when reading cart: ${state}`);
  }

  await page.waitForFunction(() => {
    return !!(
      document.querySelector('.sc-your-amazon-cart-is-empty') ||
      document.querySelector('#sc-subtotal-amount-activecart') ||
      document.querySelector('[data-name="Active Items"]') ||
      document.querySelector('#sc-active-cart')
    );
  }, { timeout: 10_000 }).catch(() => {});

  const cartSnapshot = await page.evaluate(() => {
    const activeSection =
      document.querySelector('[data-name="Active Items"]') ??
      document.querySelector('#sc-active-cart') ??
      document.querySelector('#sc-cart-active');

    const emptyCart = !!document.querySelector('.sc-your-amazon-cart-is-empty');
    const rows = activeSection
      ? Array.from(activeSection.querySelectorAll('.sc-list-item'))
      : [];

    const items = rows.map((row) => {
      const nameEl = row.querySelector('[id*="item_title"] .a-truncate-cut') ??
        row.querySelector('[id*="item_title"]') ??
        row.querySelector('.sc-product-title .a-truncate-cut') ??
        row.querySelector('.sc-product-title');
      const priceEl = row.querySelector('[id*="item_price"], .sc-price');
      const qtyEl = row.querySelector<HTMLSelectElement>('select[id*="quantity"]');
      const linkEl = row.querySelector<HTMLAnchorElement>('a[href*="/dp/"]');
      return {
        name: nameEl?.textContent?.trim() ?? "Unknown item",
        brand: null,
        size: null,
        quantity: parseInt(qtyEl?.value ?? "1", 10),
        unitPrice: null,
        lineTotal: priceEl
          ? parseFloat(priceEl.textContent?.replace(/[^0-9.]/g, "") ?? "0")
          : null,
        url: linkEl?.href ?? null,
      };
    });

    return {
      emptyCart,
      hasActiveSection: !!activeSection,
      items,
    };
  });

  if (!cartSnapshot.hasActiveSection && !cartSnapshot.emptyCart) {
    throw new Error("Couldn't verify the active Amazon cart on the page.");
  }

  const items: CartItem[] = cartSnapshot.items.filter((item) => item.name && item.name !== "Unknown item");

  const totalText = await page
    .$eval("#sc-subtotal-amount-activecart .a-size-medium", (el) => el.textContent ?? "")
    .catch(() => "");

  const estimatedTotal = totalText ? parseFloat(totalText.replace(/[^0-9.]/g, "")) : null;

  return {
    items,
    estimatedTotal,
    currency: "USD",
    itemCount: items.reduce((sum, item) => sum + Math.max(item.quantity, 1), 0),
  };
}

export async function addItemToCart(
  page: Page,
  item: GroceryItem,
  prefs: UserPreferences
): Promise<{ added: boolean; name: string; notes: string | null }> {
  const query = buildSearchQuery(item, prefs);
  executorLogger.info("Searching for item", { query });

  const searchUrl = `${config.amazon.baseUrl}/s?k=${encodeURIComponent(query)}`;
  await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(2_000);

  let state = await detectPageState(page);
  if (state !== "normal") {
    throw new Error(`Blocked by page state: ${state}`);
  }

  const firstResult = await page.$('[data-component-type="s-search-result"] a[href*="/dp/"]');
  if (!firstResult) {
    const count = await page.$$eval('[data-component-type="s-search-result"]', (els) => els.length).catch(() => 0);
    executorLogger.warn("No product link in search results", { query, resultCount: count });
    return { added: false, name: item.name, notes: `No results found for: ${query}` };
  }

  const productTitle = await firstResult.textContent().then((t) => t?.trim().slice(0, 60) ?? query);
  executorLogger.info("Clicking product", { productTitle });
  await firstResult.click();
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 });
  await page.waitForTimeout(1_500);

  state = await detectPageState(page);
  if (state !== "normal") {
    throw new Error(`Blocked by page state: ${state}`);
  }

  const addBtnSelectors = [
    "#add-to-cart-button",
    "input[name='submit.add-to-cart']",
    "[data-feature-id='desktop-atc'] input",
    "#add-to-cart-button-ubb",
    "#buybox [type='submit']",
    "#buybox button",
  ];

  let addBtn = null;
  for (const sel of addBtnSelectors) {
    addBtn = await page.$(sel);
    if (addBtn) break;
  }

  if (!addBtn) {
    executorLogger.warn("No add-to-cart button on product page", { query, url: page.url() });
    return { added: false, name: item.name, notes: `Found "${productTitle}" but could not add to cart` };
  }

  const cartCountBefore = await page.$eval("#nav-cart-count", (el) => parseInt(el.textContent ?? "0", 10)).catch(() => 0);

  await addBtn.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await addBtn.click({ force: true, timeout: 5_000 });
  } catch {
    await addBtn.evaluate((el) => (el as HTMLElement).click());
  }
  await page.waitForTimeout(3_000);

  const stateAfterClick = await detectPageState(page);
  if (stateAfterClick === "login" || stateAfterClick === "otp") {
    executorLogger.warn("Login required after clicking add-to-cart", { url: page.url() });
    return { added: false, name: item.name, notes: "Amazon session expired — please re-login" };
  }

  const cartCountAfter = await page.$eval("#nav-cart-count", (el) => parseInt(el.textContent ?? "0", 10)).catch(() => 0);
  executorLogger.info("Cart count check", { before: cartCountBefore, after: cartCountAfter, url: page.url() });

  if (cartCountAfter <= cartCountBefore) {
    executorLogger.warn("Cart count did not increase after click", { item: item.name });
    return { added: false, name: item.name, notes: `Found "${productTitle}" but add-to-cart click did not update cart` };
  }

  executorLogger.info("Item added", { item: item.name, query });
  return { added: true, name: item.name, notes: item.notes ?? null };
}

export async function removeItemFromCart(
  page: Page,
  item: GroceryItem
): Promise<{ removed: boolean; name: string; matchedName: string | null }> {
  await navigateToCart(page);

  const state = await detectPageState(page);
  if (state !== "normal") {
    throw new Error(`Blocked by page state: ${state}`);
  }

  const beforeCart = await readCart(page);
  const bestMatch = findBestCartMatch(item.name, beforeCart.items);

  if (!bestMatch) {
    executorLogger.info("Remove target not present before delete", { item: item.name });
    return { removed: false, name: item.name, matchedName: null };
  }

  const matchedName = bestMatch.name;
  const matchedRow = await findBestCartRowHandle(page, item.name, matchedName);
  if (!matchedRow) {
    executorLogger.warn("Matched cart row was not found in DOM", { item: item.name, matchedName });
    return { removed: false, name: item.name, matchedName };
  }

  const clicked = await triggerCartRowRemoval(matchedRow);

  if (!clicked) {
    executorLogger.warn("Delete button not clicked for remove target", { item: item.name, matchedName });
    return { removed: false, name: item.name, matchedName };
  }

  await waitForCartRowRemoval(page, matchedName, beforeCart.items.length);

  const afterCart = await readCart(page);
  const stillPresentMatch = findBestCartMatch(item.name, afterCart.items);
  const stillPresent = stillPresentMatch?.name === matchedName;

  executorLogger.info("Remove verification", {
    item: item.name,
    matchedName,
    stillPresent,
    postMatch: stillPresentMatch?.name ?? null,
  });

  return {
    removed: !stillPresent,
    name: item.name,
    matchedName,
  };
}

function buildSearchQuery(item: GroceryItem, prefs: UserPreferences): string {
  const key = item.name.toLowerCase().trim();
  const def = prefs.itemDefaults?.[key];
  let base = def?.searchTerm ?? inferSearchTerm(item.name);

  if (item.brand) {
    base = `${item.brand} ${base}`;
  } else if (prefs.brands[key]) {
    base = `${prefs.brands[key]} ${base}`;
  }

  if (item.size) {
    base = `${base} ${item.size}`;
  } else if (prefs.sizes[key]) {
    base = `${base} ${prefs.sizes[key]}`;
  } else if (item.unit === "pack" && !base.includes("pack")) {
    base = `${base} pack`;
  } else if (item.unit === "bunch" && !base.includes("bunch")) {
    base = `${base} bunch`;
  }

  const category = def?.category ?? inferCategoryFromName(key);
  const needsOrganic = !!category && prefs.organicCategories?.includes(category);
  if (needsOrganic && !base.toLowerCase().includes("organic")) {
    base = `organic ${base}`;
  }

  return base.trim();
}

function inferSearchTerm(name: string): string {
  const normalized = name.toLowerCase().trim();
  if (normalized === "bananas" || normalized === "banana") return "bananas bunch";
  if (normalized === "chicken breast") return "boneless skinless chicken breast";
  if (normalized === "eggs") return "eggs 12 count";
  return name;
}

function inferCategoryFromName(name: string): string | null {
  if (EGG_KEYWORDS.some((keyword) => name.includes(keyword))) return "eggs";
  if (MEAT_KEYWORDS.some((keyword) => name.includes(keyword))) return "meat";
  if (DAIRY_KEYWORDS.some((keyword) => name.includes(keyword))) return "dairy";
  return null;
}

function findBestCartMatch(requestName: string, items: CartItem[]): CartItem | null {
  const ranked = items
    .map((item) => ({ item, score: scoreCartMatch(requestName, item.name) }))
    .filter((entry) => entry.score >= 0.6)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.item ?? null;
}

function scoreCartMatch(requestName: string, candidateName: string): number {
  const requestTokens = tokenizeCartMatch(requestName);
  const candidateTokens = new Set(tokenizeCartMatch(candidateName));
  if (requestTokens.length === 0) return 0;

  let matched = 0;
  for (const token of requestTokens) {
    if (candidateTokens.has(token)) matched += 1;
  }

  const substringBonus = normalizeCartMatch(candidateName).includes(normalizeCartMatch(requestName)) ? 0.25 : 0;
  return matched / requestTokens.length + substringBonus;
}

function tokenizeCartMatch(value: string): string[] {
  const stopWords = new Set(["the", "and", "with", "for", "of", "by", "a", "an", "oz", "ounce", "ounces", "lb", "count", "pack"]);
  return normalizeCartMatch(value)
    .split(/\s+/)
    .filter((token) => token && token.length > 1 && !stopWords.has(token));
}

function normalizeCartMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function findBestCartRowHandle(
  page: Page,
  requestName: string,
  matchedName: string
): Promise<ElementHandle<HTMLElement> | null> {
  const rows = await page.$$('[data-name="Active Items"] .sc-list-item');
  let bestRow: ElementHandle<HTMLElement> | null = null;
  let bestScore = 0;

  for (const row of rows) {
    const text = await getCartRowName(row as ElementHandle<HTMLElement>);
    if (!text) continue;

    const exactBoost = text.trim() === matchedName ? 2 : 0;
    const candidateScore = scoreCartMatch(requestName, text) + exactBoost;
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestRow = row as ElementHandle<HTMLElement>;
    }
  }

  return bestRow;
}

async function getCartRowName(row: ElementHandle<HTMLElement>): Promise<string> {
  const nameHandle = await row.$(
    '[id*="item_title"] .a-truncate-cut, [id*="item_title"], .sc-product-title .a-truncate-cut, .sc-product-title'
  );
  const text = (await nameHandle?.textContent())?.trim() ?? "";
  await nameHandle?.dispose().catch(() => {});
  return text;
}

async function triggerCartRowRemoval(row: ElementHandle<HTMLElement>): Promise<boolean> {
  const selectors = [
    'input[value="Delete"]',
    '[data-action="delete"] input',
    '[data-action="delete-active"] input',
    '[data-action="delete"] a',
    '[data-action="delete-active"] a',
    'span[data-action*="delete"] input',
    'button[aria-label*="Delete"]',
    'a[aria-label*="Delete"]',
    'input[name*="submit.delete"]',
  ];

  for (const selector of selectors) {
    const control = await row.$(selector);
    if (!control) continue;

    await control.scrollIntoViewIfNeeded().catch(() => {});
    try {
      await control.click({ force: true, timeout: 5_000 });
    } catch {
      try {
        await control.evaluate((el) => (el as HTMLElement).click());
      } catch {
        await control.dispose().catch(() => {});
        continue;
      }
    }
    await control.dispose().catch(() => {});
    return true;
  }

  const quantitySelect = await row.$('select[id*="quantity"]');
  if (quantitySelect) {
    const options = await quantitySelect.evaluate((select) =>
      Array.from((select as HTMLSelectElement).options).map((option) => ({
        value: option.value,
        label: option.label,
      }))
    ).catch(() => [] as { value: string; label: string }[]);

    const deleteOption = options.find((option) => option.value === "0")
      ?? options.find((option) => /delete|remove/i.test(option.label));

    if (deleteOption) {
      try {
        await quantitySelect.selectOption(deleteOption.value);
        await quantitySelect.dispose().catch(() => {});
        return true;
      } catch {
        // Fall through to failure.
      }
    }
    await quantitySelect.dispose().catch(() => {});
  }

  return false;
}

async function waitForCartRowRemoval(page: Page, matchedName: string, beforeItemCount: number): Promise<void> {
  await page.waitForFunction(({ name, countBefore }) => {
    const activeSection = document.querySelector('[data-name="Active Items"]');
    const rows = activeSection
      ? Array.from(activeSection.querySelectorAll('.sc-list-item'))
      : Array.from(document.querySelectorAll('.sc-list-item'));

    const names = rows.map((row) => {
      const nameEl = row.querySelector('[id*="item_title"] .a-truncate-cut') ??
        row.querySelector('[id*="item_title"]') ??
        row.querySelector('.sc-product-title .a-truncate-cut') ??
        row.querySelector('.sc-product-title');
      return nameEl?.textContent?.trim() ?? "";
    });

    return !names.includes(name) || names.length < countBefore;
  }, { name: matchedName, countBefore: beforeItemCount }, { timeout: 8_000 }).catch(() => {});

  await page.waitForTimeout(1_500);
}

export function formatCartSummary(cart: CartSummary): string {
  if (cart.items.length === 0) {
    return "Your cart is empty.";
  }

  const lines = cart.items.map((item) => {
    const qty = item.quantity > 1 ? `x${item.quantity} ` : "";
    const price = item.lineTotal != null ? ` — $${item.lineTotal.toFixed(2)}` : "";
    return `• ${qty}${item.name}${price}`;
  });

  const total = cart.estimatedTotal != null ? `\nEstimated total: $${cart.estimatedTotal.toFixed(2)}` : "";
  return lines.join("\n") + total;
}
