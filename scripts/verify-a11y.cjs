/**
 * Keyboard and screen-reader audit across the whole product.
 *
 * Contrast was the only accessibility property under measurement, which covers
 * people who can see the screen and leaves out everyone driving it by keyboard
 * or by voice. This checks the four things that strand those users outright: a
 * control with no accessible name is unusable by voice and announced as
 * nothing, a control with no visible focus state leaves a keyboard user with no
 * idea where they are, a meaningful image with no alt text is a gap in the
 * page, and a skipped heading level breaks the outline people navigate by.
 *
 *   node scripts/verify-a11y.cjs [baseUrl]
 */
const puppeteer = require("puppeteer");

const BASE = process.argv[2] ?? "http://localhost:3000";
const PAGES = require("./public-pages.cjs");
const { dashboardPages } = require("./dashboard-pages.cjs");
const { signInForAudit } = require("./audit-session.cjs");
const { waitForSettled } = require("./audit-ready.cjs");

const AUDIT = () => {
  const problems = [];

  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (typeof el.className === "string" && el.className.trim()) {
      s += "." + el.className.trim().split(/\s+/).slice(0, 2).join(".");
    }
    const t = (el.textContent || "").trim().slice(0, 24);
    return t ? `${s} "${t}"` : s;
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  /* The name a screen reader or a voice command would land on. */
  const accessibleName = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label?.textContent?.trim()) return label.textContent.trim();
    }
    const wrapping = el.closest("label");
    if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim();
    if (el.tagName === "INPUT") {
      const ph = el.getAttribute("placeholder");
      const val = el.getAttribute("value");
      if (el.type === "submit" && val) return val;
      if (ph && ph.trim()) return ph.trim();
    }
    /* Text inside the control counts, including an aria-labelled icon. */
    const text = (el.textContent || "").trim();
    if (text) return text;
    const img = el.querySelector("img[alt]");
    if (img?.getAttribute("alt")?.trim()) return img.getAttribute("alt").trim();
    const svgTitle = el.querySelector("svg title");
    if (svgTitle?.textContent?.trim()) return svgTitle.textContent.trim();
    return "";
  };

  const interactive = Array.from(
    document.querySelectorAll(
      "a[href], button, input, select, textarea, [tabindex], [role='button'], [role='link']",
    ),
  ).filter((el) => {
    if (!visible(el)) return false;
    if (el.getAttribute("tabindex") === "-1") return false;
    if (el.disabled) return false;
    if (el.type === "hidden") return false;
    return true;
  });

  for (const el of interactive) {
    if (!accessibleName(el)) problems.push(`no accessible name: ${describe(el)}`);
  }

  /*
    Focus visibility, measured rather than assumed: read the resting outline and
    shadow, focus the control, and read them again. A control that looks
    identical focused is invisible to anyone using a keyboard.
  */
  const focusProblems = [];
  for (const el of interactive) {
    const before = getComputedStyle(el);
    const rest = {
      outlineWidth: before.outlineWidth,
      outlineStyle: before.outlineStyle,
      boxShadow: before.boxShadow,
      borderColor: before.borderColor,
      background: before.backgroundColor,
    };
    el.focus();
    if (document.activeElement !== el) continue;
    const after = getComputedStyle(el);
    const changed =
      after.outlineWidth !== rest.outlineWidth ||
      after.outlineStyle !== rest.outlineStyle ||
      after.boxShadow !== rest.boxShadow ||
      after.borderColor !== rest.borderColor ||
      after.backgroundColor !== rest.background;
    const hasRing =
      after.outlineStyle !== "none" && parseFloat(after.outlineWidth) > 0;
    if (!changed && !hasRing) {
      focusProblems.push(`no visible focus: ${describe(el)}`);
    }
    el.blur();
  }
  problems.push(...focusProblems);

  for (const img of document.querySelectorAll("img")) {
    if (!visible(img)) continue;
    if (img.getAttribute("aria-hidden") === "true") continue;
    if (img.getAttribute("role") === "presentation") continue;
    if (img.getAttribute("alt") === null) {
      problems.push(`img without alt: ${img.getAttribute("src")?.slice(0, 40)}`);
    }
  }

  const h1s = Array.from(document.querySelectorAll("h1")).filter(visible);
  if (h1s.length === 0) problems.push("no h1 on the page");
  if (h1s.length > 1) problems.push(`${h1s.length} h1 elements`);

  let previous = 0;
  for (const h of document.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    if (!visible(h)) continue;
    const level = Number(h.tagName[1]);
    if (previous && level > previous + 1) {
      problems.push(
        `heading jumps h${previous} to h${level}: "${(h.textContent || "").trim().slice(0, 28)}"`,
      );
    }
    previous = level;
  }

  return [...new Set(problems)];
};

async function run(page, path, findings) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 90000 });
  const settled = await waitForSettled(page);
  if (!settled) {
    findings.push(`[${path}] still loading after the wait — not measured`);
    return;
  }
  for (const problem of await page.evaluate(AUDIT)) {
    findings.push(`[${path}] ${problem}`);
  }
}

(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
  const findings = [];

  for (const path of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await run(page, path, findings);
    await page.close();
  }
  console.log(`public: ${PAGES.length} routes`);

  const owner = await browser.newPage();
  await owner.setViewport({ width: 1440, height: 900 });
  const fixture = await signInForAudit(owner, BASE).catch(() => null);
  let dashboardAudited = false;
  if (fixture) {
    const paths = dashboardPages(fixture);
    for (const path of paths) await run(owner, path, findings);
    console.log(`dashboard: ${paths.length} routes`);
    dashboardAudited = true;
  } else {
    console.log("dashboard: skipped — no audit session");
  }
  await owner.close();
  await browser.close();

  if (findings.length) {
    console.log(`\na11y findings: ${findings.length}`);
    findings.forEach((f) => console.log("  " + f));
  } else {
    console.log("\na11y: pass — names, focus, alt text and heading order clear");
  }
  if (!dashboardAudited) {
    console.log("\nincomplete: the owner dashboard was not measured");
    process.exit(1);
  }
  process.exit(findings.length ? 1 : 0);
})();
