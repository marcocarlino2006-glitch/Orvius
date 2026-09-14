import { appendFileSync } from "node:fs";
import puppeteer from "puppeteer";

const log = (payload) =>
  appendFileSync(
    "/opt/cursor/logs/debug.log",
    `${JSON.stringify({ ...payload, timestamp: Date.now() })}\n`,
  );

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

// #region agent log
log({
  hypothesisId: "C",
  location: "scripts/debug-panel-error.mjs:14",
  message: "Runtime probe starting",
  data: { url: "http://localhost:3200/dashboard/billing" },
});
// #endregion

await page.goto("http://localhost:3200/dashboard/billing", {
  waitUntil: "networkidle0",
});

const evidence = await page.evaluate(() => {
  const sheetRules = [];
  const visit = (rules, sheetHref) => {
    for (const rule of rules) {
      if ("cssRules" in rule && rule.cssRules) {
        visit(rule.cssRules, sheetHref);
      } else if (
        rule instanceof CSSStyleRule &&
        (rule.selectorText.includes("panel-action-error") ||
          rule.selectorText.includes("p:not(.os-own-color)"))
      ) {
        sheetRules.push({
          href: sheetHref,
          selector: rule.selectorText,
          color: rule.style.getPropertyValue("color"),
          priority: rule.style.getPropertyPriority("color"),
        });
      }
    }
  };

  for (const sheet of document.styleSheets) {
    visit(sheet.cssRules, sheet.href);
  }

  const shell = document.createElement("div");
  shell.className = "os-shell-night";
  const paragraph = document.createElement("p");
  paragraph.className =
    "os-own-color panel-action-error mt-4 font-sans text-sm";
  paragraph.textContent = "Runtime probe";
  shell.append(paragraph);
  document.body.append(shell);

  const style = getComputedStyle(paragraph);
  const matchedRules = sheetRules.filter(({ selector }) => {
    try {
      return paragraph.matches(selector);
    } catch {
      return false;
    }
  });

  return {
    finalUrl: location.href,
    stylesheets: [...document.styleSheets].map((sheet) => sheet.href),
    sheetRules,
    matchedRules,
    className: paragraph.className,
    computedColor: style.color,
    parentColor: getComputedStyle(shell).color,
  };
});

// #region agent log
log({
  hypothesisId: "C",
  location: "scripts/debug-panel-error.mjs:76",
  message: "Loaded stylesheet inventory",
  data: { finalUrl: evidence.finalUrl, stylesheets: evidence.stylesheets },
});
// #endregion

// #region agent log
log({
  hypothesisId: "A,D",
  location: "scripts/debug-panel-error.mjs:86",
  message: "Parsed relevant CSSOM rules",
  data: { sheetRules: evidence.sheetRules },
});
// #endregion

// #region agent log
log({
  hypothesisId: "B",
  location: "scripts/debug-panel-error.mjs:95",
  message: "Rules matching instrumented paragraph",
  data: { className: evidence.className, matchedRules: evidence.matchedRules },
});
// #endregion

// #region agent log
log({
  hypothesisId: "B,C,E",
  location: "scripts/debug-panel-error.mjs:105",
  message: "Instrumented paragraph computed colors",
  data: {
    computedColor: evidence.computedColor,
    parentColor: evidence.parentColor,
  },
});
// #endregion

await browser.close();
