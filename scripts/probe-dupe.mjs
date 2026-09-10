#!/usr/bin/env node
/**
 * Locates a duplicate-status finding: which route, which card, and the exact
 * text of the two elements holding the word.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const { signInForAudit } = require("./audit-session.cjs");
const { dashboardPages } = require("./dashboard-pages.cjs");

const BASE = "http://127.0.0.1:3000";
const WORD = process.argv[2] ?? "scheduled";

const SLOT =
  "[class*=kicker], [class*=-kind], [class*=badge], [class*=chip], [class*=-status], [class*=-pill]";

const COLLECT = `(word) => {
  const SLOT = ${JSON.stringify(SLOT)};
  const CARD = "article, [class*=-card], li";
  const hits = [];
  for (const card of document.querySelectorAll(CARD)) {
    if (card.querySelector(CARD)) continue;
    const slots = [...card.querySelectorAll(SLOT)].filter(
      (s) => s.getBoundingClientRect().height > 0 && !s.querySelector(SLOT),
    );
    if (slots.length < 2) continue;
    const holders = slots.filter((s) => (s.textContent || "").toLowerCase().includes(word));
    if (holders.length > 1) {
      hits.push({
        card: card.className || card.tagName,
        cardText: (card.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 90),
        holders: holders.map((h) => ({ cls: h.className || h.tagName, text: h.textContent.trim() })),
      });
    }
  }
  return hits;
}`;

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
try {
  const context = await browser.createBrowserContext();
  const first = await context.newPage();
  const fixture = await signInForAudit(first, BASE);
  await first.close();

  for (const path of dashboardPages(fixture)) {
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(
      (key) => window.localStorage.setItem(key, String(Date.now() + 86_400_000)),
      "orvius-pay-prompt-snooze-until",
    );
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1800));
    const hits = await page.evaluate(`(${COLLECT})(${JSON.stringify(WORD)})`);
    for (const hit of hits) {
      console.log(`${path}  card=${hit.card}`);
      console.log(`   card text: "${hit.cardText}"`);
      for (const h of hit.holders) console.log(`   holder .${h.cls} = "${h.text}"`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
