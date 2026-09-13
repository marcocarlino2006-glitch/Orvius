#!/usr/bin/env node
/**
 * Measures the things that make a screen look like a template.
 *
 * These started as one-off probes written while auditing, and the numbers they
 * produced were the argument for most of this branch's UI work: the largest
 * text anywhere in the product was 22px, /jobs led with the character "0", and
 * Settings rendered eleven identically bordered boxes. One-off probes cannot be
 * re-run against a change, so they are a tool now.
 *
 * Nothing here is a pass/fail gate. There is no correct number of eyebrows, and
 * a threshold would only invite gaming. It prints what is on the screen.
 *
 *   node scripts/surface-audit.mjs [base-url] [--json]
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const { signInForAudit } = require("./audit-session.cjs");
const { dashboardPages } = require("./dashboard-pages.cjs");

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://127.0.0.1:3200";
const AS_JSON = process.argv.includes("--json");
const SHOW_CAPS = process.argv.includes("--caps");
const PAY_PROMPT_SNOOZE_KEY = "orvius-pay-prompt-snooze-until";

const MEASURE = `(() => {
  const main = document.querySelector(".os-content") ?? document.body;
  const nodes = [...main.querySelectorAll("*")];

  /* Text sizes, counted only where text is actually rendered. */
  const sizes = new Map();
  let largest = 0;
  let largestText = "";
  let tracked = 0;
  /* Which component is producing them — a count of 134 is one row template
     rendered forty-seven times, not 134 separate decisions to undo. */
  const trackedBy = new Map();

  for (const el of nodes) {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;

    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();

    /*
      Tracked caps: the 10-11px uppercase letter-spaced micro-label. It is the
      single most reliable tell of an admin template, and counted separately
      from size because it is a style choice rather than a scale problem.
    */
    if (own) {
      const px = parseFloat(style.fontSize);
      sizes.set(px, (sizes.get(px) ?? 0) + 1);
      if (px > largest) {
        largest = px;
        largestText = own.slice(0, 40);
      }
      const spacing = parseFloat(style.letterSpacing);
      if (
        (style.textTransform === "uppercase" || own === own.toUpperCase()) &&
        /[A-Za-z]/.test(own) &&
        px <= 13 &&
        Number.isFinite(spacing) &&
        spacing > 0.3
      ) {
        tracked += 1;
        const label =
          typeof el.className === "string" && el.className.trim()
            ? el.className.trim().split(/\\s+/).slice(0, 2).join(".")
            : el.tagName.toLowerCase();
        trackedBy.set(label, (trackedBy.get(label) ?? 0) + 1);
      }
    }
  }

  /*
    Runs of identically bordered boxes of similar size — the KPI strip. Keyed on
    the border and the rounded dimensions so a row of six matching cards is one
    finding rather than six.
  */
  const boxes = new Map();
  for (const el of nodes) {
    const style = getComputedStyle(el);
    if (style.display === "none") continue;
    const width = parseFloat(style.borderTopWidth);
    if (!width) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 40) continue;
    const key = [
      style.borderTopColor,
      style.borderTopWidth,
      style.borderRadius,
      Math.round(rect.width / 12) * 12,
      Math.round(rect.height / 12) * 12,
    ].join("|");
    boxes.set(key, (boxes.get(key) ?? 0) + 1);
  }
  const identicalRun = Math.max(0, ...boxes.values());

  /*
    Dead fold: how much of the first screenful carries nothing. Sampled on a
    grid rather than measured from element boxes, because a full-height empty
    container is still empty.
  */
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let filled = 0;
  let sampled = 0;
  for (let y = 8; y < vh; y += 16) {
    for (let x = 8; x < vw; x += 16) {
      sampled += 1;
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      /* An element counts as content only if it or a close child draws
         something: text, a border, or a background distinct from the page. */
      const style = getComputedStyle(el);
      const hasText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim(),
      );
      const hasEdge =
        parseFloat(style.borderTopWidth) > 0 ||
        parseFloat(style.borderBottomWidth) > 0;
      if (hasText || hasEdge) filled += 1;
    }
  }

  /* Brand presence, and whether it ever lands on something large. */
  let brandNodes = 0;
  let brandLarge = 0;
  const isBrand = (value) => {
    /* color-mix() resolves to color(srgb r g b / a) with 0-1 channels, not
       rgb(). Matching only rgb() skipped every mixed colour in the night
       shell, which is most of them. */
    let r, g, b, a;
    let m = value && value.match(/rgba?\\(([^)]+)\\)/);
    if (m) {
      const n = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number);
      [r, g, b] = n;
      a = n[3] ?? 1;
    } else {
      m = value && value.match(/color\\(srgb ([^)]+)\\)/);
      if (!m) return false;
      const n = m[1].split(/[\\s/]+/).filter(Boolean).map(Number);
      [r, g, b] = [n[0] * 255, n[1] * 255, n[2] * 255];
      a = n[3] ?? 1;
    }
    if (a < 0.2) return false;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 60 || r !== max) return false;
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.35) return false;
    let hue = 0;
    if (max === min) hue = 0;
    else if (r === max) hue = (60 * ((g - b) / (max - min)) + 360) % 360;
    return hue >= 5 && hue <= 45;
  };
  for (const el of nodes) {
    const style = getComputedStyle(el);
    if (style.display === "none") continue;
    const hit =
      isBrand(style.color) ||
      isBrand(style.backgroundColor) ||
      isBrand(style.borderTopColor);
    if (!hit) continue;
    brandNodes += 1;
    const rect = el.getBoundingClientRect();
    if (rect.width >= 40 && rect.height >= 18) brandLarge += 1;
  }

  return {
    largestPx: largest,
    largestText,
    distinctSizes: sizes.size,
    trackedCaps: tracked,
    trackedCapsBy: [...trackedBy.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
    identicalBoxRun: identicalRun,
    deadFoldPct: sampled ? Math.round(((sampled - filled) / sampled) * 100) : null,
    brandNodes,
    brandOnLargeElements: brandLarge,
  };
})()`;

const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const context = await browser.createBrowserContext();
const first = await context.newPage();
const fixture = await signInForAudit(first, BASE);
await first.close();

if (!fixture) {
  console.error("could not establish an audit session");
  await browser.close();
  process.exit(1);
}

const results = [];

for (const path of dashboardPages(fixture)) {
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(
    (key) => window.localStorage.setItem(key, String(Date.now() + 86_400_000)),
    PAY_PROMPT_SNOOZE_KEY,
  );
  await page
    .goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60000 })
    .catch(() => page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }));
  await page
    .waitForFunction(
      `!document.querySelector('[class*="-loading"], [class*="skeleton"], [aria-busy="true"]')`,
      { timeout: 20000, polling: 250 },
    )
    .catch(() => undefined);
  await new Promise((r) => setTimeout(r, 1200));

  results.push({ route: path, ...(await page.evaluate(MEASURE)) });
  await page.close();
}

await browser.close();

if (AS_JSON) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

const name = (route) => route.replace(/^\/dashboard\/?/, "") || "command";
const pad = (value, width) => String(value).padStart(width);

console.log("\n  Surface audit — what makes a screen look like a template\n");
console.log(
  "  route                 max  sizes  caps  boxrun  dead  brand  brand≥40px",
);
console.log("  " + "─".repeat(70));
for (const row of results) {
  console.log(
    `  ${name(row.route).slice(0, 20).padEnd(20)} ${pad(row.largestPx + "px", 5)} ${pad(row.distinctSizes, 6)} ${pad(row.trackedCaps, 5)} ${pad(row.identicalBoxRun, 7)} ${pad(row.deadFoldPct + "%", 5)} ${pad(row.brandNodes, 6)} ${pad(row.brandOnLargeElements, 11)}`,
  );
}

if (SHOW_CAPS) {
  console.log("\n  Tracked-caps labels by component\n");
  for (const row of results) {
    if (!row.trackedCaps) continue;
    console.log(`  ${name(row.route)} (${row.trackedCaps})`);
    for (const [label, count] of row.trackedCapsBy) {
      console.log(`      ${pad(count, 4)}  ${label}`);
    }
  }
}

const worst = [...results].sort((a, b) => b.trackedCaps - a.trackedCaps)[0];
const biggest = [...results].sort((a, b) => b.largestPx - a.largestPx)[0];
console.log(
  `\n  Largest text in the product: ${biggest.largestPx}px on ${name(biggest.route)} — "${biggest.largestText}"`,
);
console.log(
  `  Most tracked-caps labels: ${worst.trackedCaps} on ${name(worst.route)}\n`,
);
