/**
 * Contrast audit for the public surfaces.
 *
 * Walks every text-bearing element on the marketing home page and the sign-in
 * page, in both colorways, and composites the *whole* chain of ancestor
 * backgrounds before measuring. Sampling only the nearest non-transparent
 * background is what produces phantom failures: an 8%-alpha plate reads as a
 * fully saturated one, and half the report becomes noise.
 *
 *   node scripts/verify-contrast.cjs [baseUrl]
 */
const puppeteer = require("puppeteer");

const BASE = process.argv[2] ?? "http://localhost:3000";
const PAGES = ["/", "/signin"];
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
    if (ownText.length < 2) continue;

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

  for (const [theme, label] of THEMES) {
    for (const path of PAGES) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.evaluate((t) => localStorage.setItem("orvius-theme", t), theme);
      await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        window.scrollTo(0, 0);
      });
      await new Promise((r) => setTimeout(r, 1500));

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
      await page.close();
    }
  }

  console.log(`checked ${checked} text nodes across ${THEMES.length * PAGES.length} renders`);
  if (failures.length) {
    console.log(`\nAA failures: ${failures.length}`);
    failures.forEach((f) => console.log("  " + f));
  } else {
    console.log("\nAA: pass — every text node clears 4.5:1 (3:1 for large type)");
  }
  await browser.close();
  process.exit(failures.length ? 1 : 0);
})();
