#!/usr/bin/env node
/*
 * What a person sees when something fails or isn't offered yet: a signed-out
 * page offers sign-in back to the same page instead of a Retry that can't
 * work; a failed customer list never reads as "No customers yet"; Settings
 * keeps Tab inside and hands focus back; sign-up names the open trades with
 * the interest list; annual pricing says the call allowance and overage stay
 * monthly.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(p, "utf8");

test("signed-out pages offer Sign in back to the same page; other failures keep Retry", () => {
  const failure = read("src/components/load-failure.tsx");
  assert.match(failure, /error === SESSION_EXPIRED/);
  assert.match(failure, /Sign in/);
  assert.match(failure, /Retry/);
  assert.match(failure, /\/signin\?callbackUrl=\$\{encodeURIComponent\(back\)\}/);
  assert.match(read("src/lib/safe-callback.ts"), /startsWith\("\/\/"\)/, "the sign-in page only follows same-site return paths");
  for (const page of ["calls", "jobs", "schedule", "team", "customers"]) {
    const src = read(`src/app/dashboard/${page}/page.tsx`);
    assert.match(src, /res\.status === 401 \? SESSION_EXPIRED/, page);
    assert.match(src, /<LoadFailure/, page);
  }
});

test("a customer list that failed to load is not 'No customers yet' or a zero count", () => {
  const src = read("src/app/dashboard/customers/page.tsx");
  assert.match(src, /error && !customers\.length \? null : !customers\.length \? \(\s*<ProEmptyState\s+title="No customers yet"/);
  assert.match(src, /\{error && !customers\.length \? null : \(\s*<ProLead/);
  assert.match(src, /\[query, attempt\]/, "Retry reloads");
});

test("the Settings dialog traps Tab and restores the trigger once, on close", () => {
  const src = read("src/components/settings-center/settings-center.tsx");
  assert.match(src, /event\.key !== "Tab"/);
  assert.match(src, /last\.focus\(\)/);
  assert.match(src, /first\.focus\(\)/);
  assert.match(src, /previous\?\.focus\?\.\(\);\n    \};\n  \}, \[\]\);/, "opened once, so a new onClose doesn't forget the trigger");
});

test("sign-up says which trades are open and where everyone else goes", () => {
  const src = read("src/components/signin-panel.tsx");
  assert.match(src, /Open to \{LAUNCH_SCOPE_LINE\.toLowerCase\(\)\} shops\. Another trade\? <a href="\/trades#interest">Join the interest list<\/a>/);
  assert.match(read("src/app/trades/page.tsx"), /id="interest"/);
});

test("annual pricing says the allowance and the overage rate stay monthly", async () => {
  const { OVERAGE_CENTS_PER_CALL } = await import("../src/lib/pricing-plans.ts");
  assert.equal(OVERAGE_CENTS_PER_CALL, 50, "the published rate is unchanged");
  assert.match(read("src/components/pricing-page-plans.tsx"), /Annual prepays the plan only: the included calls are still per month, and calls past them are \$\{OVERAGE_CENTS_PER_CALL\}¢ each, invoiced monthly/);
});

test("a failed check for an existing shop is unknown and retryable, never the new-shop payment form", () => {
  const src = read("src/components/onboarding-wizard.tsx");
  assert.match(src, /if \(!res\.ok\) throw new Error\(`resume check \$\{res\.status\}`\)/);
  assert.match(src, /setCheckFailed\(true\)/);
  assert.match(src, /if \(resuming \|\| checkFailed\) \{/, "the form stays hidden while the answer is unknown");
  assert.match(src, /couldn&apos;t check whether your shop is already set up/);
  assert.match(src, /Try again/);
  assert.match(src, /res\.status === 401\) \{\n\s+window\.location\.href = `\/signin\?callbackUrl=/);
  assert.match(src, /await resumeExisting\(\)\.catch\(\(\) => false\)/, "polling after checkout keeps looking through a transient error");
});
