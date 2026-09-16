import assert from "node:assert/strict";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  createDepositForLead,
  ensureBookingDepositForJob,
} from "../src/lib/booking-deposit.ts";
import { createJobFromLead } from "../src/lib/job.ts";

const prisma = new PrismaClient();
const PREFIX = "auto-deposit-proof";

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

async function makeShop(overrides = {}) {
  return prisma.business.create({
    data: {
      name: "Automatic Deposit HVAC",
      slug: unique(PREFIX),
      billingStatus: "active",
      billingPlan: "pro",
      depositEnabled: true,
      depositAmountCents: 9900,
      stripeConnectAccountId: unique("acct_auto_deposit"),
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: true,
      stripeConnectDetailsSubmitted: true,
      ...overrides,
    },
  });
}

async function makeLead(businessId) {
  return prisma.lead.create({
    data: {
      businessId,
      name: "Taylor Customer",
      phone: null,
      serviceType: "No heat",
      urgency: "same-day",
      categoryCode: "hvac.no_heat",
    },
  });
}

after(async () => {
  await prisma.business.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

test("booking creates exactly one deposit when the shop opted in and Connect is ready", async () => {
  const shop = await makeShop();
  const lead = await makeLead(shop.id);
  const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [first, second] = await Promise.all([
    createJobFromLead({ leadId: lead.id, scheduledAt }),
    createJobFromLead({ leadId: lead.id, scheduledAt }),
  ]);

  assert.equal(first.id, second.id);
  const deposits = await prisma.deposit.findMany({
    where: { businessId: shop.id, leadId: lead.id },
  });
  assert.equal(deposits.length, 1);
  assert.equal(deposits[0].jobId, first.id);
  assert.equal(deposits[0].amountCents, 9900);
  assert.equal(deposits[0].status, "pending");
  assert.ok(deposits[0].publicToken);
});

test("booking never creates a deposit without the shop's explicit opt-in", async () => {
  const shop = await makeShop({
    depositEnabled: false,
    depositAmountCents: null,
  });
  const lead = await makeLead(shop.id);

  const job = await createJobFromLead({
    leadId: lead.id,
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  assert.ok(job.id);
  assert.equal(
    await prisma.deposit.count({ where: { businessId: shop.id } }),
    0,
  );
});

test("a deposit requested before booking is linked instead of duplicated", async () => {
  const shop = await makeShop();
  const lead = await makeLead(shop.id);
  const existing = await createDepositForLead({
    businessId: shop.id,
    leadId: lead.id,
    amountCents: 9900,
  });

  const job = await createJobFromLead({
    leadId: lead.id,
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  const deposits = await prisma.deposit.findMany({
    where: { businessId: shop.id, leadId: lead.id },
  });
  assert.equal(deposits.length, 1);
  assert.equal(deposits[0].id, existing.deposit.id);
  assert.equal(deposits[0].jobId, job.id);
});

test("corrected details recover the money loop for an existing job", async () => {
  const shop = await makeShop({
    depositEnabled: false,
    depositAmountCents: null,
  });
  const lead = await makeLead(shop.id);
  const job = await createJobFromLead({
    leadId: lead.id,
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  assert.equal(
    await prisma.deposit.count({ where: { businessId: shop.id } }),
    0,
  );

  await Promise.all([
    prisma.business.update({
      where: { id: shop.id },
      data: { depositEnabled: true, depositAmountCents: 9900 },
    }),
    prisma.lead.update({
      where: { id: lead.id },
      data: { phone: "+15555550123", address: "12 Recovery Street" },
    }),
  ]);

  const recovery = await ensureBookingDepositForJob({
    businessId: shop.id,
    leadId: lead.id,
    jobId: job.id,
    sendSms: false,
  });
  assert.equal(recovery.ok, true);
  assert.equal(recovery.skipped, false);
  assert.equal(recovery.created, true);

  const deposits = await prisma.deposit.findMany({
    where: { businessId: shop.id, leadId: lead.id },
  });
  assert.equal(deposits.length, 1);
  assert.equal(deposits[0].jobId, job.id);
});
