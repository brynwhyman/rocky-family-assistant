import { chromium, BrowserContext, Page } from "playwright";
import path from "path";
import fs from "fs";
import { config } from "../app/config";
import { executorLogger } from "../util/logging";

function getProfilePath(profileName: string): string {
  return path.resolve(__dirname, "../../state/browser-profiles", profileName);
}

let contextPromise: Promise<BrowserContext> | null = null;
let contextRef: BrowserContext | null = null;

export async function getBrowserContext(): Promise<BrowserContext> {
  if (contextRef) {
    return contextRef;
  }

  if (contextPromise) {
    return contextPromise;
  }

  contextPromise = launchBrowserContext();

  try {
    contextRef = await contextPromise;
    return contextRef;
  } finally {
    contextPromise = null;
  }
}

async function launchBrowserContext(): Promise<BrowserContext> {
  const profilePath = getProfilePath(config.browser.profile);
  fs.mkdirSync(profilePath, { recursive: true });

  for (const lock of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    const lockPath = path.join(profilePath, lock);
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Ignore absent lock files.
    }
  }

  executorLogger.info("Launching browser", {
    profile: config.browser.profile,
    profilePath,
  });

  try {
    const ctx = await chromium.launchPersistentContext(profilePath, {
      headless: false,
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
      viewport: { width: 1280, height: 900 },
      timeout: 30_000,
    });

    ctx.on("close", () => {
      executorLogger.warn("Browser context closed");
      contextRef = null;
      contextPromise = null;
    });

    return ctx;
  } catch (err) {
    contextRef = null;
    const message = String(err);
    if (message.includes("database is locked") || message.includes("Permission denied")) {
      executorLogger.error("Browser profile appears locked", {
        profilePath,
        err: message,
      });
    }
    throw err;
  }
}

export async function getPage(): Promise<Page> {
  const ctx = await getBrowserContext();
  const pages = ctx.pages();
  return pages.length > 0 ? pages[0] : await ctx.newPage();
}

export async function closeBrowser(): Promise<void> {
  if (!contextRef) {
    return;
  }

  const ctx = contextRef;
  contextRef = null;
  contextPromise = null;
  await ctx.close();
}

export type PageState =
  | "normal"
  | "login"
  | "otp"
  | "captcha"
  | "payment"
  | "address"
  | "unknown";

export async function detectPageState(page: Page): Promise<PageState> {
  const url = page.url();
  const title = await page.title().catch(() => "");

  if (
    url.includes("/ap/signin") ||
    url.includes("/gp/sign-in") ||
    title.toLowerCase().includes("sign in")
  ) {
    return "login";
  }

  if (
    url.includes("/ap/cvf") ||
    url.includes("otp") ||
    title.toLowerCase().includes("verification")
  ) {
    return "otp";
  }

  if (
    url.includes("captcha") ||
    (await page.$("form[action*='captcha']").catch(() => null))
  ) {
    return "captcha";
  }

  if (url.includes("/checkout/") && url.includes("payment")) {
    return "payment";
  }

  if (url.includes("/checkout/") && url.includes("address")) {
    return "address";
  }

  return "normal";
}
