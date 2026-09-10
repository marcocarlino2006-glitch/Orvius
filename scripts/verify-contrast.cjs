/**
 * Contrast audit for the whole product — marketing and the owner dashboard.
 *
 * Walks every text-bearing element on every page, in both colorways,
 * and composites the *whole* chain of ancestor
 * backgrounds before measuring. Sampling only the nearest non-transparent
 * background is what produces phantom failures: an 8%-alpha plate reads as a
 * fully saturated one, and half the report becomes noise.
 *
 * The dashboard needs a session, so it is audited in a second pass behind a
 * fixture sign-in. If that sign-in cannot be established the pass is reported
 * as skipped rather than quietly counted as clean.
 *
 *   node scripts/verify-contrast.cjs [baseUrl]
 */
const puppeteer = require("puppeteer");

const BASE = process.argv[2] ?? "http://localhost:3000";
const PAGES = require("./public-pages.cjs");
const { dashboardPages } = require("./dashboard-pages.cjs");
const { signInForAudit } = require("./audit-session.cjs");
const { waitForSettled } = require("./audit-ready.cjs");
const THEMES = [
  ["night", "dark"],
  ["day", "light"],
];

function parseColor(str) {
  if (!str) return null;
  let m = str.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: n[0], g: n[1], b: n[2], a: n[3] ?? 1 };
  }
  m = str.match(/color\(srgb ([^)]+)\)/);
  if (m) {
    const n = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
    return { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a: n[3] ?? 1 };
  }
  return null;
}

function composite(fg, bg) {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fgStr, layerStrings) {
  const fg = parseColor(fgStr);
  if (!fg) return null;
  // Paint the ancestor stack bottom-up onto an opaque base.
  let bg = { r: 255, g: 255, b: 255, a: 1 };
  for (const layer of layerStrings.slice().reverse()) {
    const c = parseColor(layer);
    if (c) bg = composite(c, bg);
  }
  const text = composite(fg, bg);
  const l1 = luminance(text);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const COLLECT = () => {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    /*
      One character counts. This used to require two, which quietly excused
      every single-glyph label on the site — the em-dash placeholders in the
      hero's capture board, badge counts, close and check marks. Those are
      often the dimmest text on a surface, so skipping them meant the audit
      reported green on exactly the text most likely to fail. The trim above
      already drops whitespace-only nodes.
    */
    if (ownText.length < 1) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (Number(cs.opacity) < 0.15) continue;

    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") layers.push(bg);
    }

    let name = el.tagName.toLowerCase();
    if (typeof el.className === "string" && el.className.trim()) {
      name += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    }

    out.push({
      name,
      color: cs.color,
      layers,
      size: parseFloat(cs.fontSize),
      weight: Number(cs.fontWeight) || 400,
      text: ownText.slice(0, 32),
    });
  }
  return out;
};

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const failures = [];
  let checked = 0;
  let renders = 0;

  /** Measure one route in one colorway on an already-prepared page. */
  async function auditPath(page, path, theme, label) {
    await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.evaluate((t) => localStorage.setItem("orvius-theme", t), theme);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    /* Dashboard views sit behind a skeleton until their data lands, and a
       skeleton is stable forever — so wait on the loading markers, not on the
       DOM going quiet. */
    if (!(await waitForSettled(page))) {
      failures.push(`[${label} ${path}] still loading after the wait — not measured`);
      return;
    }

    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await new Promise((r) => setTimeout(r, 800));
    renders += 1;

    for (const sample of await page.evaluate(COLLECT)) {
      const value = contrast(sample.color, sample.layers);
      if (value === null) continue;
      checked += 1;
      const large = sample.size >= 24 || (sample.size >= 18.66 && sample.weight >= 700);
      const floor = large ? 3 : 4.5;
      if (value < floor) {
        failures.push(
          `[${label} ${path}] ${value.toFixed(2)}:1 (need ${floor}) ` +
            `${sample.name} @${sample.size}px "${sample.text}"`,
        );
      }
    }
  }

  for (const [theme, label] of THEMES) {
    for (const path of PAGES) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await auditPath(page, path, theme, label);
      await page.close();
    }
  }

  console.log(`public: ${checked} text nodes across ${renders} renders`);

  /* Second pass, behind a session. One page holds the cookie for every route. */
  const owner = await browser.newPage();
  await owner.setViewport({ width: 1440, height: 900 });
  const fixture = await signInForAudit(owner, BASE).catch((err) => {
    console.log(`dashboard sign-in failed: ${err.message}`);
    return null;
  });

  let dashboardAudited = false;
  if (fixture) {
    const before = checked;
    const beforeRenders = renders;
    for (const [theme, label] of THEMES) {
      for (const path of dashboardPages(fixture)) {
        await auditPath(owner, path, theme, label);
      }
    }
    dashboardAudited = true;
    console.log(
      `dashboard: ${checked - before} text nodes across ${renders - beforeRenders} renders`,
    );
  } else {
    console.log("dashboard: skipped — no audit session");
  }
  await owner.close();

  if (failures.length) {
    console.log(`\nAA failures: ${failures.length}`);
    failures.forEach((f) => console.log("  " + f));
  } else {
    console.log("\nAA: pass — every text node clears 4.5:1 (3:1 for large type)");
  }
  await browser.close();

  /* A skipped dashboard pass is not a pass: fail rather than report green on a
     surface nothing looked at. */
  if (!dashboardAudited) {
    console.log("\nincomplete: the owner dashboard was not measured");
    process.exit(1);
  }
  process.exit(failures.length ? 1 : 0);
})();
