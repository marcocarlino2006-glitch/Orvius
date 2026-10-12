#!/usr/bin/env node
/*
 * Every page, desktop and phone: HTTP status, console and page errors,
 * sideways scroll on a phone, axe WCAG 2 A/AA, title / description / one h1
 * on public pages, and every internal link resolving. Signs in with the dev
 * sign-in to reach the dashboard, so run it against a server with
 * ORVIUS_DEV_AUTH_BYPASS=1 and a seeded shop (npm run demo:seed -- --owner dev@orvius.local).
 *
 *   BASE=http://127.0.0.1:3003 node scripts/page-audit.mjs [--json out.json]
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const base = (process.env.BASE ?? "http://127.0.0.1:3003").replace(/\/$/, "");
const axe = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;

const PUBLIC = [
  "/", "/product", "/pricing", "/trades", "/try", "/launch", "/watch", "/calls", "/about", "/enterprise", "/pilot",
  "/pilot/forward", "/resources", "/help", "/docs", "/changelog", "/status", "/security", "/privacy", "/terms",
  "/sms-terms", "/cookies", "/refunds", "/dmca", "/legal", "/signin", "/signup", "/signin/reset", "/h",
  "/for/hvac", "/for/plumbing", "/for/electrical", "/this-page-does-not-exist",
];
const APP = [
  "/dashboard", "/dashboard/ask", "/dashboard/inbox", "/dashboard/inbox/messages", "/dashboard/calls", "/dashboard/customers",
  "/dashboard/jobs", "/dashboard/jobs/new", "/dashboard/schedule", "/dashboard/dispatch", "/dashboard/work", "/dashboard/team",
  "/dashboard/reports", "/dashboard/billing", "/dashboard/price-book", "/dashboard/portfolio", "/dashboard/pricing",
  "/dashboard?settings=account", "/dashboard?settings=business", "/dashboard?settings=notifications", "/dashboard?settings=billing",
];
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844 } };

const browser = await chromium.launch();
const findings = [];
const links = new Map();
const note = (page, viewport, kind, detail) => findings.push({ page, viewport, kind, detail: String(detail).slice(0, 300) });

async function signIn(ctx) {
  const p = await ctx.newPage();
  await p.goto(`${base}/api/auth/csrf`);
  const { csrfToken } = JSON.parse(await p.textContent("body"));
  await p.request.post(`${base}/api/auth/callback/dev`, { form: { csrfToken, callbackUrl: "/dashboard" } });
  await p.close();
}

for (const [vp, size] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({ viewport: size, isMobile: vp === "phone", hasTouch: vp === "phone" });
  for (const [group, paths] of [["public", PUBLIC], ["app", APP]]) {
    if (group === "app") await signIn(ctx);
    for (const path of paths) {
      const p = await ctx.newPage();
      const errors = [];
      p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      p.on("console", (m) => {
        if (m.type() === "error" && !/Failed to load resource|favicon|Content Security Policy.*eval/i.test(m.text())) errors.push(`console: ${m.text()}`);
      });
      let res;
      try {
        res = await p.goto(base + path, { waitUntil: "load", timeout: 60000 });
        await p.waitForTimeout(1500);
      } catch (e) {
        note(path, vp, "load-failed", e.message);
        await p.close();
        continue;
      }
      const status = res?.status() ?? 0;
      const expect404 = path === "/this-page-does-not-exist";
      if (expect404 ? status !== 404 : status >= 400) note(path, vp, "http", status);
      if (group === "app" && new URL(p.url()).pathname.startsWith("/signin")) note(path, vp, "redirected-to-signin", p.url());
      for (const e of [...new Set(errors)]) note(path, vp, "js-error", e);

      const facts = await p.evaluate((vp) => ({
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        wide: [...document.querySelectorAll("body *")]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 2 && getComputedStyle(el).position !== "fixed"; })
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join(".")}`),
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
        h1: document.querySelectorAll("h1").length,
        hrefs: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
        tinyTargets: vp === "phone" ? [...document.querySelectorAll("a, button")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24) && getComputedStyle(el).display !== "inline"; }).length : 0,
      }), vp).catch((e) => (note(path, vp, "inspect-failed", e.message), null));
      if (facts) {
        if (facts.overflow > 1) note(path, vp, "sideways-scroll", `${facts.overflow}px: ${facts.wide.join(", ")}`);
        if (group === "public" && !expect404) {
          if (!facts.title || /^Orvius$/.test(facts.title.trim())) note(path, vp, "title", facts.title || "(none)");
          if (vp === "desktop" && facts.description.length < 50) note(path, vp, "description", facts.description || "(none)");
          if (facts.h1 !== 1) note(path, vp, "h1-count", facts.h1);
        }
        for (const href of facts.hrefs) {
          if (!href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) continue;
          const clean = href.split("#")[0];
          if (clean && !links.has(clean)) links.set(clean, path);
        }
      }
      try {
        await p.addScriptTag({ content: axe });
        const violations = await p.evaluate(async () =>
          (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length}: ${v.nodes[0]?.target?.join(" ")}`),
        );
        for (const v of violations) note(path, vp, "a11y", v);
      } catch (e) {
        note(path, vp, "a11y-run-failed", e.message);
      }
      await p.close();
    }
  }
  if (vp === "desktop") {
    const req = ctx.request;
    for (const [href, from] of links) {
      const r = await req.get(base + href, { maxRedirects: 5, timeout: 30000 }).catch(() => null);
      if (!r || r.status() >= 400) note(from, "link", "broken-link", `${href} -> ${r?.status() ?? "no response"}`);
    }
  }
  await ctx.close();
}
await browser.close();

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`\n## ${kind} (${list.length})`);
  for (const f of list) console.log(`  [${f.viewport}] ${f.page} :: ${f.detail}`);
}
console.log(`\n${findings.length} findings across ${PUBLIC.length + APP.length} pages x 2 viewports; ${links.size} internal links checked.`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(findings, null, 2));
process.exitCode = findings.length ? 1 : 0;
