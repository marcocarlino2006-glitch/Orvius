#!/usr/bin/env node
/** Full-page Settings at desktop and phone, for reading every row of it. */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const { signInForAudit } = require("./audit-session.cjs");

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const PAY_PROMPT_SNOOZE_KEY = "orvius-pay-prompt-snooze-until";

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const context = await browser.createBrowserContext();
const first = await context.newPage();
await signInForAudit(first, BASE);
await first.close();

for (const [name, width, height] of [
  ["settings-desktop", 1440, 900],
  ["settings-phone", 390, 844],
]) {
  const page = await context.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(
    (key) => window.localStorage.setItem(key, String(Date.now() + 86_400_000)),
    PAY_PROMPT_SNOOZE_KEY,
  );
  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}`,
  });
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: `/tmp/${name}.png`, fullPage: true });
  console.log(`${name}.png  ${width}×${height}`);
  await page.close();
}

await browser.close();
