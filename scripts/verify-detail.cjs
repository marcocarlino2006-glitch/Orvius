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

/**
 * Copy that was written for whoever runs Orvius, not for the shop.
 *
 * The post-lock banner and the billing instrument name STRIPE_SECRET_KEY,
 * point at docs/BILLING-SETUP.md and say "Counsel-confirm formation state —
 * never invent". Both rendered to every signed-in owner. Reading the source
 * cannot answer this — the banner's text is assembled server-side and
 * rendered as {gate.detail}, and one founder-guarded block would excuse every
 * unguarded line in the same file. So the question is asked of the screen,
 * signed in as a shop owner, which is the only place the answer is true.
 */
const RUNBOOK_COPY = `
  [
    { re: /\\b[A-Z][A-Z0-9]+(_[A-Z0-9]+)+\\b/, what: "an env var name" },
    { re: /npm run |docs\\/[A-Za-z-]+\\.md/, what: "a command or runbook path" },
    { re: /never invent|do not claim|counsel-confirm/i, what: "an internal instruction" },
  ]
`;

/**
 * How light a background is, on the same weighting the eye uses.
 *
 * Only needed to answer one question: is this control still carrying the
 * browser's default light background on a shell painted #14120b. A date input
 * that Chrome styled is not a small contrast problem, it is a control that
 * belongs to a different product.
 */
const LIGHTNESS = `
  (value) => {
    const m = value.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/);
    if (!m) return null;
    const alpha = m[4] === undefined ? 1 : Number(m[4]);
    /* A translucent background is the surface showing through, not a fill. */
    if (alpha < 0.5) return null;
    return (Number(m[1]) * 0.2126 + Number(m[2]) * 0.7152 + Number(m[3]) * 0.0722) / 255;
  }
`;

/*
  Elements that carry a status word: the kicker above a title, and the badge
  beside it. When the same word lands in two of them the card spends two
  elements saying one thing, and the repeat reads as two separate facts.
*/
const STATUS_SLOT = `"[class*=kicker], [class*=-kind], [class*=badge], [class*=chip], [class*=-status], [class*=-pill]"`;

const COLLECT = `
  () => {
    const coolness = ${COOLNESS};
    const lightness = ${LIGHTNESS};
    const runbook = ${RUNBOOK_COPY};
    const out = {
      tiny: [], targets: [], overflow: [], cool: [], runbook: [],
      native: [], empty: [], dupe: [],
      radii: {}, fonts: {},
    };
    const label = (el) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\\s+/)[0] : "";
      const text = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 48);
      return { tag: el.tagName.toLowerCase(), cls, text };
    };

    /*
      A link running through a sentence is sized by the line-height of the text
      around it, and padding it out would break the paragraph. WCAG 2.2 excepts
      it for exactly that reason; the test is whether the link's parent holds
      prose of its own beside it.
    */
    const inlineInProse = (el) => {
      if (el.tagName !== "A" || !el.parentElement) return false;
      return Array.from(el.parentElement.childNodes).some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
      );
    };

    /*
      A checkbox inside a label is not the target — the label is, because
      clicking anywhere in it toggles the box. Measuring the input alone
      reports a 13px target the owner never has to hit.
    */
    const effectiveTarget = (el) => {
      if (el.tagName !== "INPUT" && el.tagName !== "SELECT") return el;
      const wrapper = el.closest("label");
      return wrapper && wrapper.contains(el) ? wrapper : el;
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

      if (ownText) {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join(" ");
        for (const risk of runbook) {
          if (risk.re.test(own)) {
            out.runbook.push({ ...label(el), what: risk.what });
            break;
          }
        }
      }

      const interactive =
        el.matches("a[href], button, input, select, textarea, summary, [role=button], [tabindex]:not([tabindex='-1'])") &&
        !el.disabled;
      if (interactive && rect.width > 0 && rect.height > 0 && !inlineInProse(el)) {
        const box = effectiveTarget(el).getBoundingClientRect();
        const shortest = Math.min(box.width, box.height);
        if (shortest < ${TARGET_FLOOR_PX}) {
          out.targets.push({ ...label(el), w: Math.round(box.width), h: Math.round(box.height) });
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

      if (
        el.matches(
          "input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea",
        )
      ) {
        const light = lightness(cs.backgroundColor);
        const chrome = cs.appearance || cs.webkitAppearance;
        if (light !== null && light > 0.5) {
          out.native.push({ ...label(el), why: "browser default background" });
        } else if (el.tagName === "SELECT" && chrome && chrome !== "none") {
          out.native.push({ ...label(el), why: "browser default select chrome" });
        }
      }

      const radius = cs.borderTopLeftRadius;
      if (radius && radius !== "0px" && rect.width > 8) {
        out.radii[radius] = (out.radii[radius] || 0) + 1;
      }
    }

    /*
      A list that ran out and said nothing. The page keeps its heading and its
      filters, then simply stops — and an empty inbox looks exactly like one
      that failed to load.
    */
    for (const list of document.querySelectorAll("ul, ol, [role=list]")) {
      const cs = getComputedStyle(list);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const filled = Array.from(list.children).some(
        (child) => child.getBoundingClientRect().height > 0,
      );
      if (filled) continue;
      const region = list.closest("section, article, main") || list.parentElement;
      const said = region ? region.textContent || "" : "";
      if (/\\b(no|not|none|nothing|empty|zero|yet)\\b/i.test(said)) continue;
      if (region && region.querySelector("[role=status]")) continue;
      out.empty.push({ ...label(list), why: "no message" });
    }

    /*
      The same empty state more than once on a screen. Dispatch drew a column
      per crew slot and put "Nothing scheduled" in each, so an empty day read
      as four separate pieces of bad news instead of one quiet day.
    */
    const emptyTexts = new Map();
    for (const el of document.querySelectorAll("[class*=empty], [class*=-none], [role=status]")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const text = (el.textContent || "").trim().replace(/\\s+/g, " ");
      if (!text || text.length > 80) continue;
      if (!emptyTexts.has(text)) emptyTexts.set(text, []);
      emptyTexts.get(text).push(el);
    }
    for (const [text, els] of emptyTexts) {
      if (els.length > 1) {
        out.empty.push({ ...label(els[0]), text, why: \`said \${els.length} times on one screen\` });
      }
    }

    const CARD = "article, [class*=-card], li";
    for (const card of document.querySelectorAll(CARD)) {
      /* Only the innermost card, so an li wrapping an article reports once. */
      if (card.querySelector(CARD)) continue;
      /*
        Only the innermost slot. A kicker is often a <p> wrapping a <span>,
        and both match — counting them as two holders would report every
        kicker in the product as a duplicate of itself.
      */
      const slots = Array.from(card.querySelectorAll(${STATUS_SLOT})).filter(
        (slot) => slot.getBoundingClientRect().height > 0 && !slot.querySelector(${STATUS_SLOT}),
      );
      if (slots.length < 2) continue;
      const owners = new Map();
      for (const slot of slots) {
        /* Four letters and up, so a "·" separator or a "new" never pairs up. */
        for (const word of (slot.textContent || "").toLowerCase().match(/[a-z]{4,}/g) || []) {
          if (!owners.has(word)) owners.set(word, new Set());
          owners.get(word).add(slot);
        }
      }
      for (const [word, holders] of owners) {
        if (holders.size > 1) out.dupe.push({ ...label(card), word });
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

  const KINDS = ["tiny", "targets", "overflow", "cool", "runbook", "native", "empty", "dupe"];
  const findings = Object.fromEntries(KINDS.map((k) => [k, []]));
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
    for (const key of KINDS) {
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
  const runbook = group(findings.runbook, (r) => `${r.cls}|${r.what}|${r.text}`);
  const native = group(findings.native, (r) => `${r.cls}|${r.tag}|${r.why}`);
  const empty = group(findings.empty, (r) => `${r.cls}|${r.tag}|${r.why}`);
  const dupe = group(findings.dupe, (r) => `${r.cls}|${r.word}`);

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
  section("Founder runbook copy on an owner's screen", runbook, (r) => `${r.what}  .${r.cls || r.tag}  "${r.text}"`);
  section("Controls the design system never reached", native, (r) => `${r.why}  ${r.tag}.${r.cls}`);
  section("Empty regions that read wrong", empty, (r) => `${r.why}  ${r.tag}.${r.cls}${r.text ? `  "${r.text}"` : ""}`);
  section("One status word in two places on a card", dupe, (r) => `"${r.word}"  .${r.cls || r.tag}`);

  console.log(`\nFont sizes in use: ${Object.keys(fonts).sort((a, b) => a - b).join(", ")}`);
  console.log(
    `Corner radii in use: ${Object.entries(radii)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}×${v}`)
      .join(", ")}`,
  );

  const blockers =
    tiny.length +
    targets.length +
    overflow.length +
    cool.length +
    runbook.length +
    native.length +
    empty.length +
    dupe.length;
  console.log(`\n${blockers} distinct detail defect(s)`);
  process.exit(blockers ? 1 : 0);
})();
