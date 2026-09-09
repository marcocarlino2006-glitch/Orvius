/**
 * Layout audit for the public surfaces.
 *
 * Four things that a screenshot will not reliably tell you:
 *  1. the fixed utility dock is not sitting on top of any text,
 *  2. nothing overflows the viewport horizontally at any breakpoint,
 *  3. no text box is clipping its own content,
 *  4. no in-flow text collides with text from another section *while
 *     scrolling* — a `position: sticky` block whose containing block outlives
 *     the content beside it drifts down over its own siblings, and every
 *     static screenshot of the page top looks perfectly fine.
 *
 *   node scripts/verify-layout.cjs [baseUrl]
 */
const puppeteer = require("puppeteer");

const BASE = process.argv[2] ?? "http://localhost:3000";
const VIEWPORTS = [
  { width: 1440, height: 900, name: "desktop" },
  { width: 1024, height: 820, name: "laptop" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 390, height: 844, name: "phone" },
];
const PATHS = ["/", "/signin"];
/* The dock is marketing chrome. /signin is a focused conversion surface with no
   translatable copy, so it deliberately does not mount one. */
const DOCK_PATHS = new Set(["/"]);

const AUDIT = (expectDock) => {
  const problems = [];

  /* Visually hidden text is clipped to a 1px box on purpose. */
  const isScreenReaderOnly = (el) => Boolean(el.closest(".sr-only"));

  // 1. Dock overlap. The dock is fixed, so compare it against the text boxes
  //    that are on screen at the very bottom of the document, which is where a
  //    collision actually happens.
  const dock = document.querySelector(".fixed.right-6.bottom-4");
  if (dock) {
    const d = dock.getBoundingClientRect();
    for (const el of document.querySelectorAll("footer *, .mkt-trynow *")) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join("");
      if (own.length < 2) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const overlaps =
        r.left < d.right && r.right > d.left && r.top < d.bottom && r.bottom > d.top;
      if (overlaps) {
        problems.push(`dock overlaps "${own.slice(0, 30)}"`);
      }
    }
  } else if (expectDock) {
    problems.push("utility dock not found");
  }

  // 2. Horizontal overflow.
  const docWidth = document.documentElement.scrollWidth;
  if (docWidth > window.innerWidth + 1) {
    problems.push(`horizontal overflow: scrollWidth ${docWidth} > viewport ${window.innerWidth}`);
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth + 1 && r.width > 4 && getComputedStyle(el).position !== "fixed") {
        problems.push(`  overflowing: ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
        break;
      }
    }
  }

  // 3. Clipped text.
  for (const el of document.querySelectorAll("h1, h2, h3, p, span, a, button, code")) {
    if (isScreenReaderOnly(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow === "visible" || cs.textOverflow === "ellipsis") continue;
    if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
      if (cs.overflowY === "auto" || cs.overflowY === "scroll") continue;
      problems.push(`clipped: ${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 26)}"`);
    }
  }

  return problems;
};

/*
  Text collision sweep, evaluated at one scroll position.

  Only in-flow text counts. The frosted nav is a deliberate scroll-under
  header and the dock is a deliberate floating control, so both are expected
  to pass over content; AUDIT above already holds the dock to its own rule at
  the page's resting position.

  Two collisions matter, for different reasons:
   - across sections, which means something escaped its own band, and
   - anywhere a `position: sticky` box is involved, including between siblings
     of one section. Sticky is the interesting case: a pinned box travels down
     its containing block, so if that block outlives the content beside it the
     box ends up parked on top of its own siblings. Same-section pairs are
     otherwise laid out together and move together, so they are not compared.
*/
const SCROLL_AUDIT = () => {
  const inIntendedOverlay = (el) =>
    Boolean(el.closest(".mkt-nav, .fixed.right-6.bottom-4, [role='dialog']"));

  /* Sticky on an ancestor drags the text with it, so walk up to the section. */
  const isStickyDriven = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      if (getComputedStyle(node).position === "sticky") return true;
      if (node.matches("section, footer")) break;
    }
    return false;
  };

  const textNodes = Array.from(document.querySelectorAll("body *"))
    .filter((el) => {
      const hasOwnText = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 1,
      );
      if (!hasOwnText) return false;
      if (el.closest(".sr-only")) return false;
      if (inIntendedOverlay(el)) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      if (parseFloat(cs.opacity) < 0.05) return false;
      return true;
    })
    .map((el) => ({
      el,
      rect: el.getBoundingClientRect(),
      section: el.closest("section, footer")?.className ?? "none",
      sticky: isStickyDriven(el),
    }))
    .filter(
      (n) =>
        n.rect.width > 4 &&
        n.rect.height > 4 &&
        n.rect.bottom > 0 &&
        n.rect.top < window.innerHeight,
    );

  const problems = [];
  for (let i = 0; i < textNodes.length; i++) {
    for (let j = i + 1; j < textNodes.length; j++) {
      const a = textNodes[i];
      const b = textNodes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.section === b.section && !a.sticky && !b.sticky) continue;

      const ox =
        Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
      const oy =
        Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
      if (ox > 8 && oy > 8) {
        const how = a.sticky || b.sticky ? "sticky drift" : "text collision";
        problems.push(
          `${how}: "${a.el.textContent.trim().slice(0, 28)}" over ` +
            `"${b.el.textContent.trim().slice(0, 28)}"`,
        );
      }
    }
  }
  return [...new Set(problems)];
};

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  let failures = 0;

  for (const path of PATHS) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height });
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
      await new Promise((r) => setTimeout(r, 1200));
      // Land at the very bottom: that is where the dock and the footer meet.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((r) => setTimeout(r, 600));

      const problems = await page.evaluate(AUDIT, DOCK_PATHS.has(path));

      // Walk the whole page in viewport-sized steps so sticky drift is caught.
      const docHeight = await page.evaluate(() => document.body.scrollHeight);
      const step = Math.max(240, Math.round(vp.height / 2));
      for (let y = 0; y < docHeight; y += step) {
        await page.evaluate((top) => window.scrollTo(0, top), y);
        await new Promise((r) => setTimeout(r, 180));
        const hits = await page.evaluate(SCROLL_AUDIT);
        problems.push(...hits.map((h) => `@scrollY=${y} ${h}`));
      }

      const tag = `${path} @ ${vp.name} ${vp.width}x${vp.height}`;
      if (problems.length) {
        failures += problems.length;
        console.log(`FAIL ${tag}`);
        problems.slice(0, 8).forEach((p) => console.log("   " + p));
        if (problems.length > 8) {
          console.log(`   … ${problems.length - 8} more`);
        }
      } else {
        console.log(`ok   ${tag}`);
      }
      await page.close();
    }
  }

  console.log(failures ? `\n${failures} layout problems` : "\nlayout: pass");
  await browser.close();
  process.exit(failures ? 1 : 0);
})();
