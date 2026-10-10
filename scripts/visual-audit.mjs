#!/usr/bin/env node
/**
 * Every page at phone, iPad and desktop widths: screenshots plus the layout
 * faults a person notices before reading a word — sideways scrolling, text
 * spilling off screen, type too small to read, the wrong font, inputs that make
 * iOS zoom, tap targets a thumb can't hit.
 *
 *   node scripts/visual-audit.mjs [--base http://localhost:3000] [--owner demo@orvius.local]
 *                                 [--only /pricing,/dashboard] [--shots dir] [--json out.json]
 *
 * Dashboard pages sign in as --owner with a session cookie (AUTH_SECRET from env or .env).
 * Exits 1 when any blocking fault is found.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg("base", process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OWNER = arg("owner", "demo@orvius.local");
const SHOTS = arg("shots", null);
const JSON_OUT = arg("json", null);
const ONLY = arg("only", null)?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

export const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "ipad", width: 820, height: 1180, mobile: true },
  { name: "ipad-wide", width: 1180, height: 820, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];

export const PUBLIC_PAGES = [
  "/", "/pricing", "/product", "/trades", "/for/hvac", "/for/plumbing", "/for/electrical", "/launch", "/try", "/watch",
  "/security", "/about", "/help", "/signup", "/signin", "/login", "/pilot", "/status", "/enterprise", "/resources",
  "/changelog", "/legal", "/privacy", "/terms", "/refunds", "/docs", "/this-page-does-not-exist",
];
export const APP_PAGES = [
  "/dashboard", "/dashboard/inbox", "/dashboard/calls", "/dashboard/jobs", "/dashboard/jobs/new", "/dashboard/schedule",
  "/dashboard/dispatch", "/dashboard/customers", "/dashboard/work", "/dashboard/reports", "/dashboard/billing",
  "/dashboard/settings", "/dashboard/team", "/dashboard/price-book", "/dashboard/profile", "/dashboard/ask",
];

function authSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (!existsSync(".env")) return null;
  const line = readFileSync(".env", "utf8").split("\n").find((l) => l.startsWith("AUTH_SECRET="));
  return line ? line.slice("AUTH_SECRET=".length).replace(/^["']|["']$/g, "").trim() : null;
}

/** Runs in the page. Returns faults found at the current viewport. */
function inspect({ isPhone, touch }) {
  const vw = document.documentElement.clientWidth;
  const faults = [];
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
    const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50);
    return `${el.tagName.toLowerCase()}${id}${cls}${text ? ` "${text}"` : ""}`;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    // Content of a closed <details> still reports a layout box; nobody can see it.
    if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const insideScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true;
    }
    return false;
  };
  const srOnly = (el) => {
    const r = el.getBoundingClientRect();
    return r.width <= 1 || r.height <= 1;
  };

  const docWidth = document.documentElement.scrollWidth;
  if (docWidth > vw + 1) {
    const culprits = [];
    for (const el of document.body.querySelectorAll("*")) {
      if (!visible(el) || srOnly(el) || insideScroller(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) culprits.push(`${describe(el)} [${Math.round(r.left)}→${Math.round(r.right)}]`);
      if (culprits.length >= 4) break;
    }
    faults.push({ kind: "sideways-scroll", blocking: true, detail: `page is ${docWidth}px wide on a ${vw}px screen`, samples: culprits });
  }

  const textEls = [...document.body.querySelectorAll("p,span,a,li,td,th,label,button,small,strong,em,h1,h2,h3,h4,h5,h6,div,dd,dt,figcaption,summary")]
    .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1))
    .filter((el) => visible(el) && !srOnly(el));

  // aria-hidden product pictures are scaled screenshots of the app, not text anyone reads.
  const tiny = textEls.filter((el) => { if (el.closest('[aria-hidden="true"]')) return false; const fs = parseFloat(getComputedStyle(el).fontSize); return fs > 0 && fs < (isPhone ? 11 : 10.5); });
  if (tiny.length) {
    faults.push({ kind: "tiny-text", blocking: false, detail: `${tiny.length} text elements under ${isPhone ? 11 : 10.5}px`, samples: tiny.slice(0, 4).map((el) => `${describe(el)} ${getComputedStyle(el).fontSize}`) });
  }

  const wrongFont = textEls.filter((el) => {
    const ff = getComputedStyle(el).fontFamily.toLowerCase();
    if (el.closest("code,pre,kbd,samp,svg")) return false;
    return !/inter|plex|mono|ui-monospace|menlo/.test(ff);
  });
  if (wrongFont.length) {
    faults.push({ kind: "fallback-font", blocking: true, detail: `${wrongFont.length} text elements not in Inter`, samples: wrongFont.slice(0, 4).map((el) => `${describe(el)} → ${getComputedStyle(el).fontFamily.slice(0, 60)}`) });
  }

  const clipped = textEls.filter((el) => {
    const s = getComputedStyle(el);
    if (s.textOverflow === "ellipsis" || el.closest("[data-allow-clip]")) return false;
    const hidesX = /(hidden|clip)/.test(s.overflowX);
    return hidesX && el.scrollWidth > el.clientWidth + 2;
  });
  if (clipped.length) {
    faults.push({ kind: "clipped-text", blocking: false, detail: `${clipped.length} elements cut off without an ellipsis`, samples: clipped.slice(0, 4).map(describe) });
  }

  const overflowingText = textEls.filter((el) => {
    if (insideScroller(el)) return false;
    const r = el.getBoundingClientRect();
    return r.right > vw + 1;
  });
  if (overflowingText.length && docWidth <= vw + 1) {
    faults.push({ kind: "text-off-screen", blocking: true, detail: `${overflowingText.length} text elements extend past the screen edge`, samples: overflowingText.slice(0, 4).map(describe) });
  }

  if (touch) {
    const zoomers = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]),select,textarea")]
      .filter(visible)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16);
    if (zoomers.length) {
      faults.push({ kind: "ios-zoom-input", blocking: true, detail: `${zoomers.length} inputs under 16px — iOS zooms the page when tapped${matchMedia("(pointer: coarse)").matches ? "" : " (browser lost touch emulation)"}`, samples: zoomers.slice(0, 4).map((el) => `${describe(el)} ${getComputedStyle(el).fontSize}`) });
    }
  }
  if (isPhone) {
    const small = [...document.querySelectorAll("button,[role=button],input[type=submit],a.btn,[class*=btn]")]
      .filter((el) => visible(el) && !srOnly(el))
      .filter((el) => {
        const hit = getComputedStyle(el, "::after");
        if (hit.content !== "none" && hit.position === "absolute" && parseFloat(hit.top) < 0) return false;
        const r = el.getBoundingClientRect();
        return r.height < 32 || r.width < 32;
      });
    if (small.length) {
      faults.push({ kind: "small-tap-target", blocking: false, detail: `${small.length} buttons under 32px`, samples: small.slice(0, 4).map((el) => { const r = el.getBoundingClientRect(); return `${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`; }) });
    }
  }
  return faults;
}

async function main() {
  const secret = authSecret();
  let cookie = null;
  if (secret) {
    const { encode } = await import("next-auth/jwt");
    const value = await encode({ token: { sub: OWNER, email: OWNER, name: "Audit Owner" }, secret, salt: "authjs.session-token" });
    cookie = { name: "authjs.session-token", value, domain: new URL(BASE).hostname, path: "/", httpOnly: true, sameSite: "Lax" };
  }
  const pages = [...PUBLIC_PAGES, ...(cookie ? APP_PAGES : [])].filter((p) => !ONLY || ONLY.includes(p));
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });

  const report = [];
  // One browser per width: touch emulation leaks between contexts sharing a browser, so the
  // desktop pass would switch (pointer: coarse) off for the phone and iPad passes.
  await Promise.all(VIEWPORTS.map(async (vp) => {
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      deviceScaleFactor: 1,
    });
    if (cookie) await ctx.addCookies([cookie]);
    for (const path of pages) {
      // A fresh tab per page: a full-page screenshot resets mobile emulation on the tab that took it.
      const page = await ctx.newPage();
      let faults;
      try {
        await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 60_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);
        // Walk the page so scroll-revealed sections are measured and captured as a visitor sees them.
        await page.evaluate(async () => {
          for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.8)) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
          await new Promise((r) => setTimeout(r, 250));
        });
        faults = await page.evaluate(inspect, { isPhone: vp.name === "phone", touch: vp.mobile });
        if (SHOTS) {
          const file = `${SHOTS}/${path === "/" ? "home" : path.slice(1).replace(/\//g, "_")}--${vp.name}.png`;
          await page.screenshot({ path: file, fullPage: true });
        }
      } catch (error) {
        faults = [{ kind: "load-failed", blocking: true, detail: String(error).slice(0, 160), samples: [] }];
      }
      await page.close();
      report.push({ path, viewport: vp.name, faults });
      const blocking = faults.filter((f) => f.blocking).length;
      const marks = faults.map((f) => `${f.blocking ? "✗" : "·"} ${f.kind}: ${f.detail}`).join("\n      ");
      console.log(`${blocking ? "✗" : "✓"} ${vp.name.padEnd(9)} ${path}${marks ? `\n      ${marks}` : ""}`);
      for (const f of faults) for (const s of f.samples ?? []) console.log(`          ${s}`);
    }
    await ctx.close();
    await browser.close();
  }));
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  const blocking = report.flatMap((r) => r.faults.filter((f) => f.blocking).map((f) => `${r.viewport} ${r.path} ${f.kind}`));
  console.log(`\n${report.length} page views, ${blocking.length} blocking faults`);
  process.exit(blocking.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
