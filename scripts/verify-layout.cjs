/**
 * Layout audit for the public surfaces.
 *
 * Three things that a screenshot will not reliably tell you:
 *  1. the fixed utility dock is not sitting on top of any text,
 *  2. nothing overflows the viewport horizontally at any breakpoint,
 *  3. no text box is clipping its own content.
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
      const tag = `${path} @ ${vp.name} ${vp.width}x${vp.height}`;
      if (problems.length) {
        failures += problems.length;
        console.log(`FAIL ${tag}`);
        problems.forEach((p) => console.log("   " + p));
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
