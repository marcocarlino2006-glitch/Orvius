/*
 * Setup that resumes and a checklist that tells the truth (docs/BACKLOG.md G3):
 * an owner who paid and left comes back to the form, and Command never says
 * "covered" while the shop's main number still doesn't reach Orvius.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getOwnerSetupStatus } from "../src/lib/owner-setup-state.ts";
import { resolveShopOperateNext, shopOperateBannerVisible } from "../src/lib/shop-operate.ts";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const proved = { twilioPhone: "+15125550100", ownerPhone: "+15125550199", lineVerifiedAt: new Date() };
const quiet = { failedAlerts: 0, stuckAlerts: 0, criticalAttention: 0, attentionCount: 0, proofStale: false, economicsReady: false };

test("a proved line opens Command but is not live until the main number reaches it", () => {
  const before = getOwnerSetupStatus(proved);
  assert.equal(before.ready, true);
  assert.equal(before.live, false);
  assert.equal(before.nextStep, "capture");

  const after = getOwnerSetupStatus({ ...proved, overflowForwardConfirmedAt: new Date() });
  assert.equal(after.live, true);
  assert.equal(after.nextStep, "done");
});

test("Command shows the forwarding step instead of 'covered' until capture is confirmed", () => {
  const setup = getOwnerSetupStatus(proved);
  const next = resolveShopOperateNext({ ...quiet, setupReady: setup.ready, setupNext: setup.nextStep, setupHref: "/dashboard?settings=phone" });
  assert.equal(next.id, "setup:capture");
  assert.match(next.title, /main number/);
  assert.equal(shopOperateBannerVisible(next), true);

  const done = getOwnerSetupStatus({ ...proved, overflowForwardConfirmedAt: new Date() });
  assert.equal(resolveShopOperateNext({ ...quiet, setupReady: done.ready, setupNext: done.nextStep, setupHref: "/dashboard" }).id, "covered");
});

test("the line-proved screen says forwarding is next, and offers it first", () => {
  const verify = read("src/components/onboarding-call-verify.tsx");
  assert.doesNotMatch(verify, /You’re in\./);
  assert.match(verify, /still call your main number/);
  assert.ok(verify.indexOf("Forward my main number") < verify.lastIndexOf("Enter Command"));
});

test("an owner who paid and left resumes from their paid checkout, not 'Pay first'", () => {
  const wizard = read("src/components/onboarding-wizard.tsx");
  assert.match(wizard, /fetch\("\/api\/onboarding\?resume=1"\)/);
  assert.match(wizard, /const checkoutSessionId = urlSessionId \|\| recoveredSessionId/);

  const route = read("src/app/api/onboarding/route.ts");
  assert.match(route, /findPaidCheckoutSessionId\(email\)/);
  assert.match(route, /!business && request\.nextUrl\.searchParams\.get\("resume"\) === "1"/, "only setup's own check asks Stripe");
  const post = route.slice(route.indexOf("export async function POST"));
  assert.match(post, /provisionFromCheckout\(\{ sessionId: checkoutSessionId, email/, "a recovered session is still verified against the signed-in email");
  assert.match(read("src/lib/checkout-shop.ts"), /resolvePaidCheckoutActivation\(session, subscription, email\)/);

  const lookup = read("src/lib/billing-sync.ts");
  assert.match(lookup, /customer_details: \{ email: email\.toLowerCase\(\) \}/);
  assert.match(lookup, /status: "complete"/);
});
