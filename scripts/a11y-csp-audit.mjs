#!/usr/bin/env node
/*
 * Accessibility (axe, WCAG 2 A/AA) and report-only CSP check across public and
 * dashboard pages. Needs a dev server with the dev sign-in and a seeded shop:
 *   ORVIUS_DEV_AUTH_BYPASS=1 npx next dev -p 3002 & npm run demo:seed -- --owner dev@orvius.local
 *   BASE=http://127.0.0.1:3002 node scripts/a11y-csp-audit.mjs
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const base = process.env.BASE ?? "http://127.0.0.1:3002";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const csp = [];
let failures = 0;
p.on("console", (m) => { const t = m.text(); if (/Content Security Policy/i.test(t) && !/eval/i.test(t)) csp.push(`${p.url()} :: ${t.slice(0, 220)}`); });
await p.goto(base + "/api/auth/csrf");
const { csrfToken } = JSON.parse(await p.textContent("body"));
await p.request.post(base + "/api/auth/callback/dev", { form: { csrfToken, callbackUrl: "/dashboard" } });
const pages = process.env.PAGES ? process.env.PAGES.split(",") : ["/", "/pricing", "/product", "/security", "/signin", "/signup", "/help", "/status", "/dashboard", "/dashboard/customers", "/dashboard/calls", "/dashboard?settings=account"];
for (const path of pages) {
  try {
    await p.goto(base + path, { waitUntil: "load", timeout: 90000 });
    await p.waitForTimeout(2500);
    await p.addScriptTag({ content: axe });
    const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.map((n) => n.target.join(" ") + " " + JSON.stringify(n.any[0]?.data ?? {})).join("\n      ") })));
    console.log(`\n## ${path}`);
    failures += r.length;
    for (const v of r) console.log(`  ${v.impact} ${v.id} x${v.n} :: ${v.sample}`);
  } catch (e) { console.log(`\n## ${path} ERROR ${e.message.slice(0, 120)}`); }
}
console.log("\n## CSP report-only violations:", csp.length);
process.exitCode = failures || csp.length ? 1 : 0;
for (const c of [...new Set(csp)].slice(0, 30)) console.log("  " + c);
await b.close();
