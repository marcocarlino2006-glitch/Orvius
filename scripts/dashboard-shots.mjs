#!/usr/bin/env node
/**
 * Screenshot every owner route, for eyeballing a change the audits call clean.
 *
 * Usage: node scripts/dashboard-shots.mjs <out-dir> [base-url]
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const { signInForAudit } = require("./audit-session.cjs");
const { dashboardPages } = require("./dashboard-pages.cjs");

const OUT = process.argv[2] ?? "/tmp/dash-after";
const BASE = process.argv[3] ?? "http://127.0.0.1:3000";
const PAY_PROMPT_SNOOZE_KEY = "orvius-pay-prompt-snooze-until";

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
const context = await browser.createBrowserContext();

const first = await context.newPage();
const fixture = await signInForAudit(first, BASE);
await first.close();

for (const path of dashboardPages(fixture)) {
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(
    (key) => window.localStorage.setItem(key, String(Date.now() + 86_400_000)),
    PAY_PROMPT_SNOOZE_KEY,
  );
  await page
    .goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60000 })
    .catch(() => page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }));
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}`,
  });
  await new Promise((r) => setTimeout(r, 2000));
  const name = path.replace(/^\/dashboard\/?/, "") || "home";
  await page.screenshot({ path: `${OUT}/${name.replace(/\//g, "_")}.png` });
  console.log(`${path} → ${name.replace(/\//g, "_")}.png`);
  await page.close();
}

await browser.close();
