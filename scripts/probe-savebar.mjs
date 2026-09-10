#!/usr/bin/env node
/** Is the Settings save bar in reach from the bottom of the form? */
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

const page = await context.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(
  (key) => window.localStorage.setItem(key, String(Date.now() + 86_400_000)),
  PAY_PROMPT_SNOOZE_KEY,
);
await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

const report = await page.evaluate(`(async () => {
  const bar = document.querySelector(".pro-settings-savebar");
  if (!bar) return { error: "no save bar on the page" };
  const scroller =
    [...document.querySelectorAll("*")].find(
      (el) => el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(el).overflowY),
    ) ?? document.scrollingElement;

  const look = () => {
    const r = bar.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      inViewport: r.bottom > 0 && r.top < window.innerHeight,
    };
  };

  const atTop = look();
  scroller.scrollTop = scroller.scrollHeight;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 400));
  const atBottom = look();

  const last = document.querySelector(".pro-settings-secondary:last-of-type");
  const lastRect = last?.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  const coversLast =
    lastRect && barRect.bottom > lastRect.top && barRect.top < lastRect.bottom;

  return {
    scroller: scroller.tagName + "." + (scroller.className || "").split(/\\s+/)[0],
    viewport: window.innerHeight,
    atTop,
    atBottom,
    coversLastSection: Boolean(coversLast),
  };
})()`);

console.log(JSON.stringify(report, null, 2));
await browser.close();
