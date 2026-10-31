#!/usr/bin/env node
/*
 * Every API route proves who is calling before it does anything, or is on
 * the public list below with the reason it may be open. A new route that
 * does neither fails CI, so "forgot the guard" can't ship.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = "src/app/api";

function routes(dir = ROOT) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routes(path);
    return name === "route.ts" ? [path] : [];
  });
}

const GUARD =
  /\bauth\(|\b(withOffice|withOwner|withTech|isPrivilegedRequest|verifyAdminRequest|secretsMatch|verify[A-Z]\w*|validateTwilio\w*|voiceSimSecretMatches|constructEvent|resolveShopAccess|require[A-Z]\w*|openVoiceMachine)\b/;

/* Open on purpose. Each is rate limited, token-scoped, or read-only public data. */
const PUBLIC = {
  "auth/[...nextauth]": "NextAuth's own sign-in endpoints",
  "auth/magic-link": "signing in; rate limited",
  "auth/password-reset": "signing in; rate limited",
  "auth/signup": "creating an account; rate limited",
  "auth/email-change": "the emailed token is the proof; rate limited",
  "csp-report": "browsers post CSP violations without a session",
  "demo-line": "read-only: whether the public demo line is free",
  "demo-web": "public browser demo; rate limited and ticketed",
  funnel: "cookieless page-view counts; allowlisted events, rate limited, always 204",
  preview: "public shop preview; rate limited per IP, fail closed",
  "preview/[token]": "the preview token is the capability",
  "preview/[token]/share": "the preview token is the capability",
  "public/book/[slug]": "public booking page for a shop",
  "public/calendar/[token]": "calendar feed token is the capability",
  "public/chat/[slug]": "public website chat for a shop",
  "public/confirm/[token]": "customer confirmation token",
  "public-demo": "public demo",
  "public/deposit/[token]": "customer deposit token",
  "public/estimate/[token]": "customer estimate token",
  "public/find": "public shop finder",
  "public/invoice/[token]": "customer invoice token",
  "public/plans/[slug]": "public maintenance plans page",
  "public/review/[token]": "customer review token",
  "public/tech/[token]": "customer-facing technician arrival link",
  "public/unsubscribe": "signed unsubscribe token",
  "public/setup-emails": "signed unsubscribe token",
  status: "public status page",
};

const key = (path) => path.slice(ROOT.length + 1, -"/route.ts".length);

test("every API route has a guard or a stated reason to be public", () => {
  const all = routes();
  assert.ok(all.length > 150, "found the routes");
  const open = all.filter((path) => !PUBLIC[key(path)] && !GUARD.test(readFileSync(path, "utf8")));
  assert.deepEqual(open.map(key), [], "add a guard, or add the route to PUBLIC with the reason it is open");
  const stale = Object.keys(PUBLIC).filter((k) => !all.some((path) => key(path) === k));
  assert.deepEqual(stale, [], "a public entry whose route is gone");
});

test("founder routes need the founder, and crons need the cron secret", () => {
  for (const path of routes()) {
    const source = readFileSync(path, "utf8");
    if (key(path).startsWith("admin/")) {
      assert.match(source, /isPrivilegedRequest|verifyAdminRequest|isFounderEmail/, `${key(path)} is a founder route`);
    }
    if (key(path).startsWith("cron/")) {
      assert.match(source, /secretsMatch|verifyAdminRequest/, `${key(path)} must check CRON_SECRET`);
    }
    if (key(path).startsWith("tech/[token]")) {
      assert.match(source, /withTech\(/, `${key(path)} must resolve the technician from the token`);
    }
  }
});
