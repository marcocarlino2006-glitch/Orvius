#!/usr/bin/env node
/*
 * Whether an inbound lead becomes a booked job on its own.
 *
 * The qualification rules below were always imported. The plan gate was not:
 * a local shouldAutoBook() took `hasJobsModule` as an argument, when the whole
 * question the real gate answers is how that boolean gets derived — through
 * getEffectivePlanId and canAccessModule, from a shop's billing status and
 * pilot window. A copy handed the answer cannot fail when billing changes
 * shape, and it never saw four of the outcomes at all: not_found,
 * already_booked, missing_business and non_service.
 *
 * The gate now runs against the database, so what is graded is the decision
 * an actual shop's row produces.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  inferExplicitUrgency,
  isLeadQualifiedForBooking,
  isPriorityUrgency,
  maybeAutoBookLead,
} from "../src/lib/auto-job.ts";

const prisma = new PrismaClient();

const daysFromNow = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};

async function makeShop(billing) {
  return prisma.business.create({
    data: {
      name: "Auto Book Test",
      slug: `auto-book-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      pilotEndsAt: daysFromNow(20),
      ...billing,
    },
  });
}

async function makeLead(businessId, overrides = {}) {
  return prisma.lead.create({
    data: {
      businessId,
      phone: "+15551234567",
      serviceType: "AC repair",
      categoryCode: "hvac.no_cool",
      urgency: "this-week",
      source: "call",
      ...overrides,
    },
  });
}

const dropShop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

test("urgency is read out of what the caller actually said", () => {
  assert.equal(isPriorityUrgency("emergency"), true);
  assert.equal(isPriorityUrgency("same-day"), true);
  assert.equal(isPriorityUrgency("today"), true);
  assert.equal(isPriorityUrgency("this-week"), false);
  assert.equal(isPriorityUrgency("flexible"), false);
  assert.equal(isPriorityUrgency(null), false);

  assert.equal(inferExplicitUrgency("burst pipe, water everywhere"), "emergency");
  assert.equal(inferExplicitUrgency("need help today please"), "same-day");
  assert.equal(inferExplicitUrgency("sometime this week"), "this-week");
  assert.equal(inferExplicitUrgency("no rush, whenever works"), "flexible");
  assert.equal(inferExplicitUrgency("my water heater is making noise"), null);
});

test("a lead qualifies on a reachable caller plus something to work on", () => {
  const qualifies = (lead) => isLeadQualifiedForBooking(lead);

  assert.equal(
    qualifies({ phone: "+15551234567", serviceType: "AC repair", categoryCode: "hvac.no_cool" }),
    true,
  );
  assert.equal(
    qualifies({ phone: "+15551234567", serviceType: null, address: "12 Main St" }),
    true,
  );
  assert.equal(
    qualifies({ phone: "+15551234567", serviceType: "SMS inquiry", categoryCode: "plumb.water_heater" }),
    true,
    "a classified SMS request is real demand even before an address is parsed",
  );

  assert.equal(qualifies({ phone: "555", serviceType: "AC repair", address: "12 Main St" }), false);
  assert.equal(qualifies({ phone: "+15551234567", serviceType: "call me back" }), false);
  assert.equal(qualifies({ phone: "+15551234567", serviceType: "SMS inquiry" }), false);
  assert.equal(qualifies({ phone: "+15551234567", serviceType: "unknown" }), false);
  assert.equal(qualifies({ phone: "+15551234567" }), false);
  assert.equal(
    qualifies({
      phone: "+15551234567",
      serviceType: "calling about advertising for your furnace business",
      categoryCode: "other.non_service",
    }),
    false,
  );
});

test("a Pro shop books a qualified lead whatever the hurry", async () => {
  const shop = await makeShop({ billingStatus: "active", billingPlan: "pro" });
  try {
    const lead = await makeLead(shop.id, { urgency: "flexible" });
    const result = await maybeAutoBookLead(lead.id);

    assert.equal(result.created, true);
    assert.equal(result.qualified, true);
    assert.ok(result.jobId);

    const job = await prisma.job.findUnique({ where: { id: result.jobId } });
    assert.equal(job.businessId, shop.id);
  } finally {
    await dropShop(shop.id);
  }
});

test("Line books the emergency and holds the rest", async () => {
  /* Line buys the night shift, so it closes capture on a priority call and
     stops short of the dispatch board on anything that can wait. */
  const shop = await makeShop({ billingStatus: "active", billingPlan: "line" });
  try {
    const urgent = await makeLead(shop.id, { urgency: "emergency" });
    const urgentResult = await maybeAutoBookLead(urgent.id);
    assert.equal(urgentResult.created, true);

    const later = await makeLead(shop.id, { urgency: "this-week" });
    const laterResult = await maybeAutoBookLead(later.id);
    assert.equal(laterResult.created, false);
    assert.equal(laterResult.qualified, true, "held, not rejected");
    assert.equal(laterResult.skipReason, "plan_blocked");
  } finally {
    await dropShop(shop.id);
  }
});

test("a shop whose pilot ran out books nothing", async () => {
  /* The plan gate reads straight through to billing, which the copied gate
     could not: it was handed the answer as an argument. */
  const shop = await makeShop({ billingStatus: "pilot", pilotEndsAt: daysFromNow(-1) });
  try {
    const lead = await makeLead(shop.id, { urgency: "this-week" });
    const result = await maybeAutoBookLead(lead.id);

    assert.equal(result.created, false);
    assert.equal(result.skipReason, "plan_blocked");
  } finally {
    await dropShop(shop.id);
  }
});

test("a pilot still inside its window books like Pro", async () => {
  const shop = await makeShop({ billingStatus: "pilot", pilotEndsAt: daysFromNow(10) });
  try {
    const lead = await makeLead(shop.id, { urgency: "flexible" });
    assert.equal((await maybeAutoBookLead(lead.id)).created, true);
  } finally {
    await dropShop(shop.id);
  }
});

test("the reason a lead was passed over is specific", async () => {
  const shop = await makeShop({ billingStatus: "active", billingPlan: "pro" });
  try {
    const unqualified = await makeLead(shop.id, {
      serviceType: "call me back",
      categoryCode: null,
    });
    assert.equal((await maybeAutoBookLead(unqualified.id)).skipReason, "unqualified");

    const solicitation = await makeLead(shop.id, {
      serviceType: "advertising opportunity",
      categoryCode: "other.non_service",
    });
    assert.equal((await maybeAutoBookLead(solicitation.id)).skipReason, "non_service");

    const orphan = await prisma.lead.create({
      data: { phone: "+15551234567", serviceType: "AC repair", source: "call" },
    });
    assert.equal((await maybeAutoBookLead(orphan.id)).skipReason, "missing_business");
    await prisma.lead.delete({ where: { id: orphan.id } }).catch(() => {});

    assert.equal((await maybeAutoBookLead("no-such-lead")).skipReason, "not_found");
  } finally {
    await dropShop(shop.id);
  }
});

test("booking the same lead twice returns the first job", async () => {
  const shop = await makeShop({ billingStatus: "active", billingPlan: "pro" });
  try {
    const lead = await makeLead(shop.id, { urgency: "emergency" });
    const first = await maybeAutoBookLead(lead.id);
    const second = await maybeAutoBookLead(lead.id);

    assert.equal(second.created, false);
    assert.equal(second.skipReason, "already_booked");
    assert.equal(second.jobId, first.jobId, "one call, one job on the board");
  } finally {
    await dropShop(shop.id);
  }
});

test.after(() => prisma.$disconnect());
