/*
 * Setup that resumes and a checklist that tells the truth (docs/BACKLOG.md G3):
 * an owner who paid and left comes back to the form. A proved line is live:
 * the receptionist is answering the number we assigned.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getOwnerSetupStatus } from "../src/lib/owner-setup-state.ts";
import { resolveShopOperateNext, shopOperateBannerVisible } from "../src/lib/shop-operate.ts";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const proved = { twilioPhone: "+15125550100", ownerPhone: "+15125550199", lineVerifiedAt: new Date() };
const quiet = { failedAlerts: 0, stuckAlerts: 0, criticalAttention: 0, attentionCount: 0, proofStale: false, economicsReady: false };

test("a proved line is live — the receptionist is answering", () => {
  const before = getOwnerSetupStatus(proved);
  assert.equal(before.ready, true);
  assert.equal(before.live, true);
  assert.equal(before.nextStep, "done");

  const next = resolveShopOperateNext({ ...quiet, setupReady: before.ready, setupNext: before.nextStep, setupHref: "/dashboard" });
  assert.equal(next.id, "covered");
  assert.equal(shopOperateBannerVisible(next), false);
});

test("the line-proved screen says the receptionist is answering", () => {
  const verify = read("src/components/onboarding-call-verify.tsx");
  assert.doesNotMatch(verify, /You’re in\./);
  assert.match(verify, /Your receptionist is on/);
  assert.match(verify, /<ActivationChecklist \/>/);
  assert.doesNotMatch(verify, /Connect my business number/);
});

test("an owner who paid and left resumes from their paid checkout, not 'Pay first'", () => {
  const wizard = read("src/components/onboarding-wizard.tsx");
  assert.match(wizard, /fetch\("\/api\/onboarding\?resume=1"\)/);
  assert.match(wizard, /const checkoutSessionId = urlSessionId \|\| recoveredSessionId/);

  const route = read("src/app/api/onboarding/route.ts");
  assert.match(route, /findPaidCheckoutSessionId\(email\)/);
  assert.match(route, /\(!business \|\| sandbox\) && request\.nextUrl\.searchParams\.get\("resume"\) === "1"/, "only setup's own check asks Stripe, for a new or test-mode shop");
  const post = route.slice(route.indexOf("export async function POST"));
  assert.match(post, /provisionFromCheckout\(\{ sessionId: checkoutSessionId, email/, "a recovered session is still verified against the signed-in email");
  assert.match(read("src/lib/checkout-shop.ts"), /resolvePaidCheckoutActivation\(session, subscription, email\)/);

  const lookup = read("src/lib/billing-sync.ts");
  assert.match(lookup, /customer_details: \{ email: email\.toLowerCase\(\) \}/);
  assert.match(lookup, /status: "complete"/);
});
