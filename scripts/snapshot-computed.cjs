/**
 * Computed-style snapshot for the public surface.
 *
 * Records the resolved colour of every element on every public page in both
 * colourways. Refactoring stylesheets is only safe if you can show the browser
 * ends up in the same place, and "the audits still pass" does not show that —
 * an audit checks thresholds, not equality. This records the actual values so a
 * before/after diff can assert nothing moved.
 *
 * CSS animation is frozen before reading, but the hero's call player advances
 * on a JS timer, so the split between played and unplayed waveform bars will
 * differ run to run. Same colours, different counts: that one is expected.
 *
 * The dashboard is included behind a session. Leaving it out would have made
 * this useless for the change it was written for: most of the stylesheet is
 * product UI, so a diff that stops at the sign-in wall cannot say whether a
 * deletion moved anything an owner looks at.
 *
 *   node scripts/snapshot-computed.cjs <outFile> [baseUrl] [--public-only]
 */
const { writeFileSync } = require("node:fs");
const puppeteer = require("puppeteer");

const PAGES = require("./public-pages.cjs");
const OUT = process.argv[2];
const BASE = process.argv[3]?.startsWith("http")
  ? process.argv[3]
  : "http://localhost:3000";
const PUBLIC_ONLY = process.argv.includes("--public-only");
const THEMES = ["night", "day"];

if (!OUT) {
  console.error("usage: node scripts/snapshot-computed.cjs <outFile> [baseUrl]");
  process.exit(2);
}

/* Motion makes computed values a moving target, so freeze it before reading. */
const FREEZE = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
`;

/*
  Geometry as well as colour. Colour alone would have called a stylesheet
  deletion safe while a grid collapsed underneath it: a removed display or
  padding rule moves everything and repaints nothing.
*/
const COLLECT = () =>
  Array.from(document.querySelectorAll("body *")).map((el, i) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return [
      i,
      el.tagName,
      el.className && typeof el.className === "string" ? el.className : "",
      cs.color,
      cs.backgroundColor,
      cs.borderTopColor,
      cs.borderBottomColor,
      cs.display,
      cs.position,
      cs.fontSize,
      cs.fontWeight,
      Math.round(r.x),
      Math.round(r.y),
      Math.round(r.width),
      Math.round(r.height),
    ].join("|");
  });

async function record(context, path, theme, snapshot) {
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([
    {
      name: "prefers-color-scheme",
      value: theme === "night" ? "dark" : "light",
    },
  ]);
  await page
    .goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60000 })
    .catch(() => page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }));
  await page.addStyleTag({ content: FREEZE });
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
  }, theme);

  /* Pages that fetch on mount keep changing shape after load, and a
     half-rendered page reads as a styling change when it is not. Settle on
     a stable element count before measuring. */
  let stable = 0;
  let last = -1;
  for (let tick = 0; tick < 40 && stable < 3; tick++) {
    await new Promise((r) => setTimeout(r, 250));
    const n = await page.evaluate(() => document.querySelectorAll("body *").length);
    stable = n === last ? stable + 1 : 0;
    last = n;
  }
  snapshot[`${path}::${theme}`] = await page.evaluate(COLLECT);
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const snapshot = {};

  for (const path of PAGES) {
    for (const theme of THEMES) {
      await record(browser, path, theme, snapshot);
    }
  }

  if (!PUBLIC_ONLY) {
    const { dashboardPages } = require("./dashboard-pages.cjs");
    const { signInForAudit } = require("./audit-session.cjs");

    /* Its own context, so the session cookie cannot leak into the public
       renders above and change what they show. */
    const owner = await browser.createBrowserContext();
    const page = await owner.newPage();
    const fixture = await signInForAudit(page, BASE).catch(() => null);
    await page.close();

    if (!fixture) {
      console.warn("dashboard skipped: could not sign in");
    } else {
      for (const path of dashboardPages(fixture)) {
        for (const theme of THEMES) {
          await record(owner, path, theme, snapshot);
        }
      }
    }
  }

  await browser.close();
  writeFileSync(OUT, JSON.stringify(snapshot, null, 0));
  const n = Object.values(snapshot).reduce((s, a) => s + a.length, 0);
  console.log(`snapshot: ${n} elements across ${Object.keys(snapshot).length} renders`);
})();
