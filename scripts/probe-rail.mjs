#!/usr/bin/env node
/**
 * Reads the right rail as rendered: which badge treatment and which stat
 * pattern each card actually gets. Written because the same kind of
 * information in three cards was reading as three different components.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const { signInForAudit } = require("./audit-session.cjs");

const BASE = process.argv[3] ?? "http://127.0.0.1:3000";
const OUT = process.argv[2] ?? "/tmp/rail";

const COLLECT = `() => {
  const out = [];
  for (const card of document.querySelectorAll(".pro-rail-card")) {
    const badge = card.querySelector(".pro-rail-status");
    const bs = badge ? getComputedStyle(badge) : null;
    out.push({
      title: card.querySelector(".pro-rail-card-title")?.textContent?.trim() ?? "?",
      badge: badge
        ? { text: badge.textContent.trim(), background: bs.backgroundColor, padding: bs.padding }
        : null,
      stats: card.querySelector(".pro-night-watch-stats")
        ? "bordered boxes"
        : card.querySelector(".pro-rail-rows")
          ? "label/value rows"
          : card.querySelector(".pro-setup-score-bar")
            ? "progress bar"
            : "none",
    });
  }
  return out;
}`;

mkdirSync(OUT, { recursive: true });

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
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));

  const cards = await page.evaluate(`(${COLLECT})()`);
  if (!cards.length) console.log("no .pro-rail-card found");
  for (const card of cards) {
    console.log(
      `${card.title.padEnd(16)} badge=${
        card.badge
          ? `"${card.badge.text}" bg=${card.badge.background} pad=${card.badge.padding}`
          : "none"
      }  stats=${card.stats}`,
    );
  }

  const rail = await page.$(".pro-rail-card");
  if (rail) {
    const box = await page.evaluate(`(() => {
      const cards = [...document.querySelectorAll(".pro-rail-card")];
      const rects = cards.map((c) => c.getBoundingClientRect());
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      return { x: left - 8, y: top - 8, width: right - left + 16, height: bottom - top + 16 };
    })()`);
    await page.screenshot({ path: `${OUT}/rail.png`, clip: box });
    console.log(`\nrail shot -> ${OUT}/rail.png`);
  }
} finally {
  await browser.close();
}
