/*
 * The billing lifecycle policies (docs/BACKLOG.md B1, B2, B4, B11):
 * 7 days of full access after a failed payment, a canceled line that stops
 * answering at once and keeps its number 30 days, deletion that releases the
 * number, and no charge for someone who can't open a shop.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { billingLockReason, isBillingEntitled, PAST_DUE_GRACE_DAYS } from "../src/lib/billing-entitlement.ts";
import { syncSubscriptionToBusiness } from "../src/lib/billing-sync.ts";
import { LINE_RETENTION_DAYS, releaseLapsedLines } from "../src/lib/line-lifecycle.ts";

const prisma = new PrismaClient();
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const days = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

test("past due keeps the product for the grace period, then locks", () => {
  assert.equal(PAST_DUE_GRACE_DAYS, 7);
  assert.equal(isBillingEntitled({ billingStatus: "past_due", pastDueSince: days(3) }), true);
  assert.equal(isBillingEntitled({ billingStatus: "past_due", pastDueSince: days(8) }), false);
  assert.equal(billingLockReason({ billingStatus: "past_due", pastDueSince: days(8) }), "past_due");
  assert.equal(isBillingEntitled({ billingStatus: "past_due" }), true, "no clock yet means inside grace");
});

function subscription(businessId, status) {
  return { id: `sub_${businessId}`, customer: `cus_${businessId}`, status, metadata: { businessId }, items: { data: [] } };
}

test("Stripe status changes start and clear the grace and cancel clocks", async () => {
  const shop = await prisma.business.create({
    data: { name: "Clock Air", slug: `clock-${stamp()}`, billingStatus: "active", environment: "test" },
  });
  try {
    await syncSubscriptionToBusiness(subscription(shop.id, "past_due"));
    const first = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.ok(first.pastDueSince);
    await syncSubscriptionToBusiness(subscription(shop.id, "past_due"));
    const again = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(again.pastDueSince.getTime(), first.pastDueSince.getTime(), "a retry doesn't restart the grace");

    await syncSubscriptionToBusiness(subscription(shop.id, "canceled"));
    const canceled = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(canceled.billingStatus, "canceled");
    assert.ok(canceled.canceledAt);
    assert.equal(canceled.pastDueSince, null);

    await syncSubscriptionToBusiness(subscription(shop.id, "active"));
    const back = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(back.canceledAt, null);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("lapsed lines are only reported until release is switched on", async () => {
  const prev = process.env.ORVIUS_RELEASE_LAPSED_LINES;
  delete process.env.ORVIUS_RELEASE_LAPSED_LINES;
  const line = `+1555${2_000_000 + Math.floor(Math.random() * 8e6)}`;
  const lapsed = await prisma.business.create({
    data: {
      name: "Lapsed Air",
      slug: `lapsed-${stamp()}`,
      billingStatus: "canceled",
      canceledAt: days(LINE_RETENTION_DAYS + 1),
      twilioPhone: line,
      vapiPhoneNumber: line,
      environment: "production",
    },
  });
  try {
    const result = await releaseLapsedLines();
    assert.equal(result.mode, "dry_run");
    assert.ok(result.due >= 1);
    const after = await prisma.business.findUnique({ where: { id: lapsed.id } });
    assert.equal(after.twilioPhone, line, "nothing released in dry run");
    assert.equal(after.lineReleasedAt, null);
  } finally {
    if (prev === undefined) delete process.env.ORVIUS_RELEASE_LAPSED_LINES;
    else process.env.ORVIUS_RELEASE_LAPSED_LINES = prev;
    await prisma.business.delete({ where: { id: lapsed.id } }).catch(() => {});
  }
});

test("a canceled shop's number answers with a message, not its assistant", () => {
  const route = read("src/app/api/webhooks/vapi/route.ts");
  const canceled = route.indexOf("if (owner && !isLineEntitled(owner))");
  assert.ok(canceled > 0 && canceled < route.indexOf("return { assistantId: owner.vapiAssistantId }"));
  const sync = read("src/lib/billing-sync.ts");
  assert.match(sync, /await suspendShopLine\(updated\)/);
  assert.match(sync, /await resumeShopLine\(updated\)/);
});

test("deleting a workspace or shop releases its line before the records go", () => {
  const route = read("src/app/api/account/delete/route.ts");
  assert.ok(route.indexOf("releaseShopLine(") < route.indexOf("deleteWorkspace(session"));
  assert.doesNotMatch(route, /Contact support if you want the phone number released/);
  const admin = read("src/app/api/businesses/route.ts");
  assert.ok(admin.indexOf("releaseShopLine(business)") < admin.indexOf("prisma.business.delete"));
});

test("checkout refuses a new customer who couldn't create a shop after paying", () => {
  const route = read("src/app/api/billing/checkout/route.ts");
  const gate = route.indexOf("canCreateShopForEmail(");
  assert.ok(gate > 0 && gate < route.indexOf("stripe.checkout.sessions.create"));
});

test.after(() => prisma.$disconnect());
