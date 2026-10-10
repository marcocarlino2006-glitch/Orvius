import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DEMO_LINE_TEL } from "../src/lib/demo-line.ts";
import { supportPhone } from "../src/lib/support.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the support number is a real US number, and never the AI demo line", () => {
  assert.deepEqual(supportPhone("(555) 201-3344"), { tel: "+15552013344", display: "+1 555 201 3344" });
  assert.deepEqual(supportPhone("+1 555 201 3344"), { tel: "+15552013344", display: "+1 555 201 3344" });
  assert.equal(supportPhone(""), null);
  assert.equal(supportPhone(undefined), null);
  assert.equal(supportPhone("12345"), null);
  assert.equal(supportPhone(DEMO_LINE_TEL), null);
  assert.equal(supportPhone("844-643-9170"), null);
});

test("no page offers the demo line as a way to reach support", () => {
  for (const p of ["src/app/help/page.tsx", "src/app/help/[slug]/page.tsx", "src/components/marketing-shell.tsx", "src/app/status/page.tsx"]) {
    const src = read(p);
    assert.doesNotMatch(src, /tel:\+18446439170/, `${p} hard-codes the demo line`);
  }
  assert.match(read("src/components/marketing-shell.tsx"), /Hear the AI · \{DEMO_LINE_DISPLAY\}/);
});

test("every place an owner gets stuck offers a person", () => {
  for (const p of ["src/app/help/page.tsx", "src/app/help/[slug]/page.tsx", "src/app/status/page.tsx", "src/components/billing-lock-screen.tsx"]) {
    assert.match(read(p), /<SupportContact\b/, `${p} has no support contact`);
  }
  for (const p of ["src/app/dashboard/error.tsx", "src/app/global-error.tsx", "src/components/os-sidebar-footer.tsx", "src/components/marketing-shell.tsx"]) {
    assert.match(read(p), /supportPhone\(\)/, `${p} ignores the support phone`);
  }
  const component = read("src/components/support-contact.tsx");
  assert.match(component, /SUPPORT_RESPONSE/);
  assert.match(read("src/lib/support.ts"), /normally within one business day/);
  const verify = read("scripts/prod-verify.mjs");
  assert.match(verify, /pass\("Support", `email \$\{email\} on the help center`\)/, "email-only support passes");
  assert.match(verify, /fail\("Support", "the help center shows no way to reach a person"\)/);
  assert.doesNotMatch(verify, /warn\("Support", "email only/, "email-only is a choice, not a warning");
});
