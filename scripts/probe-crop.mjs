#!/usr/bin/env node
/**
 * Screenshots one selector on one owner route, for checking a region the
 * whole-page shots render too small to judge.
 *
 * Usage: node scripts/probe-crop.mjs <path> <selector> <out.png> [base-url]
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const { signInForAudit } = require("./audit-session.cjs");

const [, , PATH = "/dashboard", SELECTOR = "body", OUT = "/tmp/crop.png", BASE = "http://127.0.0.1:3000"] =
  process.argv;

mkdirSync(dirname(OUT), { recursive: true });

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
try {
  const context = await browser.createBrowserContext();
  const first = await context.newPage();
  await signInForAudit(first, BASE);
  await first.close();

  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(
    (key) => window.localStorage.setItem(key, String(Date.now() + 86_400_000)),
    "orvius-pay-prompt-snooze-until",
  );
  await page.goto(`${BASE}${PATH}`, { waitUntil: "networkidle2", timeout: 60000 });
  await page.addStyleTag({
    content: `*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}`,
  });
  await new Promise((r) => setTimeout(r, 2000));

  const el = await page.$(SELECTOR);
  if (!el) {
    console.log(`no match for ${SELECTOR} on ${PATH}`);
  } else {
    await el.screenshot({ path: OUT });
    console.log(`${PATH} ${SELECTOR} -> ${OUT}`);
  }
} finally {
  await browser.close();
}
