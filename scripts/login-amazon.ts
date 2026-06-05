import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const profilePath = path.resolve(__dirname, "../state/browser-profiles/grocery-executor");

(async () => {
  for (const lock of ["SingletonLock", "SingletonSocket", "SingletonCookie"]) {
    try { fs.unlinkSync(path.join(profilePath, lock)); } catch { /* ok */ }
  }
  console.log("Opening Amazon in grocery-executor profile...");
  const ctx = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = await ctx.newPage();
  await page.goto("https://www.amazon.com", { waitUntil: "domcontentloaded" });
  console.log("Sign in to Amazon if needed, then close the browser window.");

  console.log("\nBrowse Amazon Fresh to confirm it works, then close the browser window to save the session.");

  // Wait for all pages to be closed
  await new Promise<void>((resolve) => {
    const check = setInterval(async () => {
      if (ctx.pages().length === 0) {
        clearInterval(check);
        resolve();
      }
    }, 1000);
  });

  await ctx.close();

  console.log("Session saved. You can now run: npm run dev");
  process.exit(0);
})();
