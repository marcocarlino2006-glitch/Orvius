#!/usr/bin/env node
/*
 * Browser-side hardening: every page refuses plugins and <base> hijacks, the
 * full content policy runs report-only with violations logged, and the
 * report endpoint never echoes tokens or takes unbounded input.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { ENFORCED_CSP, reportOnlyCsp } = await import("../src/lib/csp.ts");
const logged = [];
test.mock.module("../src/lib/logger.ts", {
  namedExports: { logWarn: (event, data) => logged.push({ event, data }), logInfo: () => {}, logError: () => {} },
});
const { POST } = await import("../src/app/api/csp-report/route.ts");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every page enforces object-src none and base-uri self, and sends the full policy report-only", () => {
  assert.match(ENFORCED_CSP, /object-src 'none'/);
  assert.match(ENFORCED_CSP, /base-uri 'self'/);
  const policy = reportOnlyCsp("'none'");
  for (const directive of ["default-src 'self'", "frame-ancestors 'none'", "report-uri /api/csp-report", "wss://*.daily.co"]) {
    assert.ok(policy.includes(directive), directive);
  }
  const config = read("next.config.ts");
  assert.equal((config.match(/Content-Security-Policy-Report-Only/g) ?? []).length, 2, "both the app and the embeddable pages");
  assert.match(config, /\$\{ENFORCED_CSP\}; frame-ancestors 'none'/);
  assert.match(config, /\$\{ENFORCED_CSP\}; frame-ancestors \*/);
});

test("a violation report is logged without its query string, and junk is ignored", async () => {
  logged.length = 0;
  const report = (body, type = "application/csp-report") =>
    POST(new Request("http://localhost/api/csp-report", { method: "POST", headers: { "content-type": type, "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` }, body }));
  let res = await report(
    JSON.stringify({ "csp-report": { "document-uri": "https://orvius.im/i/abc?token=secret", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?k=1" } }),
  );
  assert.equal(res.status, 204);
  res = await report(JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://orvius.im/", effectiveDirective: "connect-src", blockedURL: "wss://x.example/s" } }]), "application/reports+json");
  assert.equal(res.status, 204);
  assert.equal((await report("not json")).status, 204);
  assert.deepEqual(
    logged.map((l) => l.data),
    [
      { directive: "script-src-elem", blocked: "https://evil.example/x.js", page: "https://orvius.im/i/abc" },
      { directive: "connect-src", blocked: "wss://x.example/s", page: "https://orvius.im/" },
    ],
  );
  assert.doesNotMatch(JSON.stringify(logged), /secret/);
});

test("the loading skeleton is a live status region and the light dashboard's muted grey passes 4.5:1", () => {
  assert.match(read("src/components/shell-skeleton.tsx"), /role="status" aria-busy="true" aria-label="Loading dashboard"/);
  assert.match(read("src/app/dashboard/orvius-modern.css"), /--m-mute: #494950;/);
  assert.match(read("package.json"), /"audit:a11y": "node scripts\/a11y-csp-audit\.mjs"/);
});

test("sign-in asks for an email, not a work email, and the Google button can't be pressed twice", () => {
  const panel = read("src/components/signin-panel.tsx");
  assert.doesNotMatch(panel, /work email/i);
  assert.match(panel, />\s*Email\s*<\/label>/);
  assert.match(panel, /placeholder="you@example\.com"/);
  assert.match(panel, /disabled=\{googleBusy\}/);
  assert.match(panel, /Opening Google…/);
  for (const file of ["src/components/interest-list-form.tsx", "src/components/early-access-form.tsx"]) assert.doesNotMatch(read(file), /you@company\.com/);
  assert.match(read("src/app/signin/page.tsx"), /AccessDenied: "That Google account isn’t connected to a shop yet/);
});

test("the page audit found nothing: schedule grid cells have roles, quiet text passes 4.5:1, and the audit stays runnable", () => {
  const schedule = read("src/app/dashboard/schedule/page.tsx");
  assert.equal((schedule.match(/role="rowheader"/g) ?? []).length, 2);
  assert.equal((schedule.match(/role="cell"/g) ?? []).length, 2);
  assert.equal((schedule.match(/role="columnheader"/g) ?? []).length, 2);
  assert.doesNotMatch(read("src/app/dashboard/settings-center.css"), /#8d8d8d/i);
  assert.match(read("src/app/dashboard/orvius-modern.css"), /--m-mute: #494950;/);
  assert.match(read("src/app/globals.css"), /html\[data-theme="day"\] \.os-shell-night :is\(\.status-pill-flare/);
  assert.match(read("src/components/pro-lead.tsx"), /className="ms-row" tabIndex=\{0\}/);
  assert.match(read("package.json"), /"audit:pages": "node scripts\/page-audit\.mjs"/);
});
