import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PAST_DUE_GRACE_DAYS, PAST_DUE_LINE_DAYS, PILOT_DAYS } from "../src/lib/billing-entitlement.ts";
import { commercialTerms, platformFeePercentLabel } from "../src/lib/commercial-terms.ts";
import { pricingFaq } from "../src/lib/pricing-faq.ts";
import { OVERAGE_CENTS_PER_CALL, getPaidPlans } from "../src/lib/pricing-plans.ts";
import {
  CALLER_HOURLY_LIMIT,
  DEFAULT_ASK_DAILY_LIMIT,
  DEFAULT_SHOP_DAILY_CEILING,
  LINE_RETENTION_DAYS,
} from "../src/lib/usage-limits.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const groups = commercialTerms();
const row = (g, r) => groups.find((x) => x.id === g).rows.find((x) => x.id === r).detail;
const all = groups.flatMap((g) => [g.title, g.lead, ...g.rows.map((r) => `${r.label} ${r.detail}`)]).join("\n");

test("the offer covers every commercial question a buyer asks", () => {
  assert.deepEqual(
    groups.map((g) => g.id),
    ["two-bills", "limits", "terms", "supported"],
  );
  for (const [g, r] of [
    ["two-bills", "subscription"],
    ["two-bills", "customer-payments"],
    ["limits", "calls"],
    ["limits", "texts"],
    ["limits", "ask"],
    ["limits", "runaway"],
    ["terms", "trial"],
    ["terms", "cancel"],
    ["terms", "refunds"],
    ["terms", "late"],
    ["supported", "trades"],
    ["supported", "phones"],
    ["supported", "integrations"],
  ]) {
    assert.ok(row(g, r).length > 40, `${g}.${r} says something`);
  }
});

test("every published limit is the number the code enforces", () => {
  for (const plan of getPaidPlans()) assert.ok(row("limits", "calls").includes(plan.includedCalls.toLocaleString("en-US")));
  assert.ok(row("limits", "calls").includes(`${OVERAGE_CENTS_PER_CALL}¢`));
  assert.match(row("limits", "calls"), /80% and at 100%/);
  assert.ok(row("limits", "ask").includes(String(DEFAULT_ASK_DAILY_LIMIT)));
  assert.ok(row("limits", "runaway").includes(String(CALLER_HOURLY_LIMIT)));
  assert.ok(row("limits", "runaway").includes(DEFAULT_SHOP_DAILY_CEILING.toLocaleString("en-US")));
  assert.ok(row("terms", "trial").includes(String(PILOT_DAYS)));
  assert.ok(row("terms", "cancel").includes(String(LINE_RETENTION_DAYS)));
  assert.ok(row("terms", "late").includes(String(PAST_DUE_GRACE_DAYS)));
  assert.ok(row("terms", "late").includes(String(PAST_DUE_LINE_DAYS)));
  assert.ok(row("two-bills", "customer-payments").includes(platformFeePercentLabel()));
  assert.equal(platformFeePercentLabel(), "1%");
});

test("the enforcing code reads its limits from the same module", () => {
  assert.match(read("src/lib/call-spend-guard.ts"), /from "@\/lib\/usage-limits"/);
  assert.match(read("src/lib/model-usage.ts"), /from "@\/lib\/usage-limits"/);
  assert.match(read("src/lib/line-lifecycle.ts"), /from "@\/lib\/usage-limits"/);
});

test("no surprise charges and no overclaiming", () => {
  assert.doesNotMatch(all, /unlimited|guarantee|never miss|100% (of|answered|uptime)/i);
  assert.match(row("two-bills", "subscription"), /only other charge is call overage/);
  assert.match(row("terms", "trial"), /no free trial/);
  assert.match(read("src/lib/owner-nudges.ts"), /OVERAGE_CENTS_PER_CALL}¢, invoiced once after the month ends/);
});

test("pricing, FAQ, refunds and billing tell the same story", () => {
  assert.match(read("src/app/pricing/page.tsx"), /terms={<PricingTerms \/>}/);
  const faq = Object.fromEntries(pricingFaq.map((f) => [f.id, f.answer]));
  assert.match(faq.cancel, /Settings → Billing → Manage/);
  assert.ok(faq.cancel.includes(String(LINE_RETENTION_DAYS)));
  assert.match(faq["payments-fee"], /separate from your Orvius plan/);
  assert.ok(faq.launch.includes(String(PILOT_DAYS)));
  const refunds = read("src/app/refunds/page.tsx");
  assert.match(refunds, /Settings → Billing → Manage/);
  assert.match(refunds, /LINE_RETENTION_DAYS/);
  assert.match(read("src/components/billing-content.tsx"), /billing-split-note/);
});

test("a locked owner can still take their data, and billing errors are plain", () => {
  assert.match(read("src/components/billing-lock-screen.tsx"), /\/api\/account\/export/);
  const portal = read("src/app/api/billing/portal/route.ts");
  assert.doesNotMatch(portal, /error: message/);
  assert.match(portal, /Nothing was changed/);
});
