#!/usr/bin/env node
/**
 * Measures the right edge of every action row on a page, and the rail card
 * titles. Both were suspected of drifting; this says by how much.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const { signInForAudit } = require("./audit-session.cjs");

const BASE = process.argv[3] ?? "http://127.0.0.1:3000";
const PATH = process.argv[2] ?? "/dashboard";

const COLLECT = `() => {
  const round = (n) => Math.round(n * 10) / 10;

  const titles = [...document.querySelectorAll(".pro-rail-card-title")].map((el) => ({
    text: el.textContent.trim(),
    color: getComputedStyle(el).color,
    size: getComputedStyle(el).fontSize,
  }));

  const feet = [...document.querySelectorAll(".pro-rail-card")].map((card) => ({
    title: card.querySelector(".pro-rail-card-title")?.textContent?.trim() ?? "?",
    hasFoot: Boolean(card.querySelector(".pro-rail-card-foot")),
  }));

  /* Every cluster of controls that sits on the trailing edge of a row. */
  const rows = [];
  for (const row of document.querySelectorAll("[class*='-actions'], [class*='-row-actions']")) {
    const r = row.getBoundingClientRect();
    if (r.width === 0) continue;
    const parent = row.parentElement?.getBoundingClientRect();
    rows.push({
      cls: row.className.split(" ")[0],
      text: row.textContent.replace(/\\s+/g, " ").trim().slice(0, 48),
      right: round(r.right),
      parentRight: parent ? round(parent.right) : null,
      gap: parent ? round(parent.right - r.right) : null,
    });
  }
  return { titles, feet, rows };
}`;

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
  await new Promise((r) => setTimeout(r, 2000));

  const { titles, feet, rows } = await page.evaluate(`(${COLLECT})()`);

  console.log("rail card titles:");
  for (const t of titles) console.log(`  ${t.text.padEnd(16)} ${t.color} ${t.size}`);

  console.log("\nrail card footers:");
  for (const f of feet) console.log(`  ${f.title.padEnd(16)} foot=${f.hasFoot}`);

  console.log(`\naction rows on ${PATH}:`);
  const byClass = new Map();
  for (const row of rows) {
    if (!byClass.has(row.cls)) byClass.set(row.cls, []);
    byClass.get(row.cls).push(row);
  }
  for (const [cls, group] of byClass) {
    const gaps = [...new Set(group.map((r) => r.gap))];
    console.log(`  ${cls} ×${group.length} trailing gap${gaps.length > 1 ? "s" : ""}=${gaps.join(", ")}`);
    for (const row of group) console.log(`      right=${row.right} parent=${row.parentRight}  "${row.text}"`);
  }
} finally {
  await browser.close();
}
