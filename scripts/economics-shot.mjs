#!/usr/bin/env node
/**
 * Screenshots the economics panel on the Command page, which sits below the
 * fold and so never appears in a viewport-sized capture.
 *
 * Usage: node scripts/economics-shot.mjs <out.png> [base-url]
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const { signInForAudit } = require("./audit-session.cjs");

const OUT = process.argv[2] ?? "/tmp/economics.png";
const BASE = process.argv[3] ?? "http://127.0.0.1:3200";
const PAY_PROMPT_SNOOZE_KEY = "orvius-pay-prompt-snooze-until";

mkdirSync(dirname(OUT), { recursive: true });

const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const context = await browser.createBrowserContext();
const first = await context.newPage();
await signInForAudit(first, BASE);
await first.close();

const page = await context.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(
  (key) => window.localStorage.setItem(key, String(Date.now() + 86_400_000)),
  PAY_PROMPT_SNOOZE_KEY,
);
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2", timeout: 60000 });
await page
  .waitForSelector("#shop-economics", { timeout: 30000 })
  .catch(() => undefined);
await page.addStyleTag({
  content: `*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}`,
});
await new Promise((r) => setTimeout(r, 2500));

const panel = await page.$("#shop-economics");
if (!panel) {
  console.error("economics panel did not render");
  await browser.close();
  process.exit(1);
}

await panel.screenshot({ path: OUT });
console.log(
  JSON.stringify(
    await page.evaluate(`(() => {
      const bars = [...document.querySelectorAll(".trend-week")].map((li) => ({
        label: li.querySelector(".trend-week-label").textContent,
        title: li.querySelector(".trend-bar").getAttribute("title"),
        partial: li.querySelector(".trend-bar").classList.contains("is-partial"),
      }));
      const delta = document.querySelector(".trend-delta");
      const note = document.querySelector(".trend-note");
      return { bars, delta: delta && delta.textContent, note: note && note.textContent };
    })()`),
    null,
    2,
  ),
);
console.log(`→ ${OUT}`);

await browser.close();
