import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getSelfServePlans,
  pricingPlans,
} from "../src/lib/pricing-plans.ts";
import { pricingCompareColumns } from "../src/lib/pricing-feature-matrix.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("public pricing offers only concrete paid plans", () => {
  assert.deepEqual(
    getSelfServePlans().map((plan) => plan.id),
    ["line", "pro", "fleet"],
  );
  assert.deepEqual(pricingCompareColumns, ["line", "pro", "fleet"]);

  const publicPlans = read("src/components/pricing-page-plans.tsx");
  assert.match(publicPlans, /paidPlans\.map/);
  assert.doesNotMatch(publicPlans, /pricingPlans\.map/);
});

test("launch copy discloses assisted operations without a public free trial", () => {
  const publicCopy = [
    read("src/app/pricing/page.tsx"),
    read("src/app/pilot/page.tsx"),
    read("src/app/api/billing/checkout/route.ts"),
    read("src/lib/pricing-faq.ts"),
    ...pricingPlans.map((plan) =>
      [plan.tagline, plan.period, plan.idealFor, ...plan.highlights].join(" "),
    ),
  ].join("\n");

  assert.doesNotMatch(publicCopy, /30 days free|free design partner|during trial/i);
  assert.match(publicCopy, /founder-assisted/i);
  assert.match(publicCopy, /no advertised free-trial period/i);
});

test("owner-facing navigation consistently calls the home surface Command", () => {
  const ownerCopy = [
    read("src/components/onboarding-call-verify.tsx"),
    read("src/components/onboarding-wizard.tsx"),
    read("src/app/api/webhooks/twilio/sms/route.ts"),
    read("src/lib/institutional-standards.ts"),
  ].join("\n");

  assert.doesNotMatch(ownerCopy, /open Today|work from Today|on Today/i);
  assert.match(ownerCopy, /open Command|work from Command|in Command/i);
});
