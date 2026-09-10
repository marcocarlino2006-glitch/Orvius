/**
 * Detail audit for the owner product: the defects thresholds do not catch.
 *
 * The contrast, a11y, layout and dock audits all pass, and the dashboard still
 * has 9px labels, tap targets a thumb misses, and a shell painted in a cool
 * grey the rest of the product left behind. Each of those is invisible to a
 * gate that asks "is this above the minimum" — they are failures of craft, not
 * of compliance, and they need their own measurements.
 *
 * The pay prompt is snoozed before measuring. It is a real part of the product,
 * but it covers the page with a scrim, and a scrim over every element makes
 * every reading about the scrim.
 *
 *   node scripts/verify-detail.cjs [baseUrl]
 */
const puppeteer = require("puppeteer");

const { signInForAudit } = require("./audit-session.cjs");
const { dashboardPages } = require("./dashboard-pages.cjs");
const { PAY_PROMPT_SNOOZE_KEY } = { PAY_PROMPT_SNOOZE_KEY: "orvius-pay-prompt-snooze-until" };

const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://127.0.0.1:3000";

/* Below this a label stops being small type and becomes a texture. */
const TYPE_FLOOR_PX = 10;

/*
  24px is the WCAG 2.2 minimum for a pointer target, and the smallest thing a
  thumb finds on the first try. Anything the owner has to aim at while holding
  a phone in a van needs to clear it.
*/
const TARGET_FLOOR_PX = 24;

const FREEZE = `*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}`;

/**
 * Whether a colour is off the product's warm axis.
 *
 * The palette is warm: the page is #14120b, surfaces are #201e18, and every
 * neutral carries more red than blue. A neutral with more blue than red is a
 * leftover from the cool grey the shell was built in, and next to a warm
 * surface it reads as a different product.
 */
const COOLNESS = `
  (value) => {
    const m = value.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
    if (!m) return null;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const alpha = m[4] === undefined ? 1 : Number(m[4]);
    if (alpha < 0.05) return null;
    /* Chromatic colours are intentional brand accents, not shell neutrals. */
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min > 40) return null;
    return b - r;
  }
`;

const COLLECT = `
  () => {
    const coolness = ${COOLNESS};
    const out = { tiny: [], targets: [], overflow: [], cool: [], radii: {}, fonts: {} };
    const label = (el) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\\s+/)[0] : "";
      const text = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 48);
      return { tag: el.tagName.toLowerCase(), cls, text };
    };

    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const size = parseFloat(cs.fontSize);
      const ownText = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
      );
      if (ownText && size < ${TYPE_FLOOR_PX}) {
        out.tiny.push({ ...label(el), px: Number(size.toFixed(2)) });
      }
      if (ownText) out.fonts[size.toFixed(2)] = (out.fonts[size.toFixed(2)] || 0) + 1;

      const interactive =
        el.matches("a[href], button, input, select, textarea, summary, [role=button], [tabindex]:not([tabindex='-1'])") &&
        !el.disabled;
      if (interactive && rect.width > 0 && rect.height > 0) {
        const shortest = Math.min(rect.width, rect.height);
        if (shortest < ${TARGET_FLOOR_PX}) {
          out.targets.push({ ...label(el), w: Math.round(rect.width), h: Math.round(rect.height) });
        }
      }

      /* Text clipped by its own box, with no ellipsis to admit it. */
      if (
        ownText &&
        el.scrollWidth > el.clientWidth + 1 &&
        cs.overflow !== "visible" &&
        cs.textOverflow !== "ellipsis"
      ) {
        out.overflow.push({ ...label(el), scroll: el.scrollWidth, client: el.clientWidth });
      }

      for (const prop of ["color", "backgroundColor", "borderTopColor"]) {
        const delta = coolness(cs[prop]);
        if (delta !== null && delta > 6) {
          out.cool.push({ ...label(el), prop, value: cs[prop], blueOverRed: delta });
        }
      }

      const radius = cs.borderTopLeftRadius;
      if (radius && radius !== "0px" && rect.width > 8) {
        out.radii[radius] = (out.radii[radius] || 0) + 1;
      }
    }
    return out;
  }
`;

(async () => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.createBrowserContext();

  const first = await context.newPage();
  const fixture = await signInForAudit(first, BASE).catch(() => null);
  await first.close();
  if (!fixture) {
    console.error("detail: could not sign in — is the server running with a local database?");
    await browser.close();
    process.exit(2);
  }

  const findings = { tiny: [], targets: [], overflow: [], cool: [] };
  const radii = {};
  const fonts = {};
  let pagesSeen = 0;

  for (const path of dashboardPages(fixture)) {
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    /* Snooze before first paint, so the scrim never colours a measurement. */
    await page.evaluateOnNewDocument(
      (key) => window.localStorage.setItem(key, String(Date.now() + 86_400_000)),
      PAY_PROMPT_SNOOZE_KEY,
    );
    await page
      .goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60000 })
      .catch(() => page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }));
    await page.addStyleTag({ content: FREEZE });
    await new Promise((r) => setTimeout(r, 2500));

    const result = await page.evaluate(`(${COLLECT})()`);
    for (const key of ["tiny", "targets", "overflow", "cool"]) {
      for (const row of result[key]) findings[key].push({ route: path, ...row });
    }
    for (const [k, v] of Object.entries(result.radii)) radii[k] = (radii[k] || 0) + v;
    for (const [k, v] of Object.entries(result.fonts)) fonts[k] = (fonts[k] || 0) + v;
    pagesSeen += 1;
    await page.close();
  }

  await browser.close();

  /** Collapse repeats: the same class on twelve rows is one defect, not twelve. */
  const group = (rows, keyOf) => {
    const map = new Map();
    for (const row of rows) {
      const key = keyOf(row);
      if (!map.has(key)) map.set(key, { ...row, count: 0, routes: new Set() });
      const entry = map.get(key);
      entry.count += 1;
      entry.routes.add(row.route);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  };

  const tiny = group(findings.tiny, (r) => `${r.cls}|${r.px}`);
  const targets = group(findings.targets, (r) => `${r.cls}|${r.tag}`);
  const overflow = group(findings.overflow, (r) => `${r.cls}|${r.tag}`);
  const cool = group(findings.cool, (r) => `${r.cls}|${r.prop}|${r.value}`);

  const section = (title, rows, render) => {
    console.log(`\n${title} — ${rows.length} distinct`);
    for (const row of rows.slice(0, 25)) {
      console.log(`  ${render(row)}   ×${row.count} on ${row.routes.size} route(s)`);
    }
    if (rows.length > 25) console.log(`  … ${rows.length - 25} more`);
  };

  console.log(`detail audit: ${pagesSeen} owner routes\n`);
  section("Type below the 10px floor", tiny, (r) => `${r.px}px  .${r.cls || r.tag}  "${r.text}"`);
  section("Pointer targets under 24px", targets, (r) => `${r.w}×${r.h}  ${r.tag}.${r.cls}  "${r.text}"`);
  section("Text clipped without an ellipsis", overflow, (r) => `${r.tag}.${r.cls}  "${r.text}"`);
  section("Cool neutrals on a warm palette", cool, (r) => `${r.prop} ${r.value} (+${r.blueOverRed} blue)  .${r.cls || r.tag}`);

  console.log(`\nFont sizes in use: ${Object.keys(fonts).sort((a, b) => a - b).join(", ")}`);
  console.log(
    `Corner radii in use: ${Object.entries(radii)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}×${v}`)
      .join(", ")}`,
  );

  const blockers = tiny.length + targets.length + overflow.length + cool.length;
  console.log(`\n${blockers} distinct detail defect(s)`);
  process.exit(blockers ? 1 : 0);
})();
