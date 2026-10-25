/*
 * A past visit is typed onto the customer. It is finished history.
 * It does not text, bill, review, or count as work Orvius booked.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { recordPastVisit, PastVisitError } = await import("../src/lib/past-visit.ts");
const { getCustomerTimeline } = await import("../src/lib/customer.ts");
const { getShopOutcomes } = await import("../src/lib/shop-outcomes.ts");
const { jobLifecycle, jobSteps } = await import("../src/lib/job-lifecycle.ts");
const { jobRowFacts } = await import("../src/lib/job-row.ts");
const { PRIOR_VISIT_CODE } = await import("../src/lib/job-outcome.ts");

const prisma = new PrismaClient();

function shopDay(offsetDays) {
  const at = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

test("the history section is where a past visit is typed", () => {
  const page = readFileSync(new URL("../src/app/dashboard/customers/[id]/page.tsx", import.meta.url), "utf8");
  const writer = readFileSync(new URL("../src/lib/past-visit.ts", import.meta.url), "utf8");
  assert.match(page, /Add a past visit/);
  assert.match(page, /does not text them, send a bill, or add a review/);
  assert.doesNotMatch(writer, /sendCustomer|notifyTech|visitReview|invoice/i);
});

test("a past visit lands on the customer and nowhere else", async () => {
  const shop = await prisma.business.create({
    data: {
      name: "Earlier HVAC",
      slug: `past-${Date.now()}`,
      environment: "test",
      trade: "HVAC",
      timezone: "America/New_York",
      billingStatus: "active",
      billingPlan: "pro",
    },
  });
  const other = await prisma.business.create({
    data: { name: "Other HVAC", slug: `past-other-${Date.now()}`, environment: "test", trade: "HVAC" },
  });
  try {
    const customer = await prisma.customer.create({
      data: {
        businessId: shop.id,
        name: "Helen Cho",
        phone: "+13125550177",
        phoneNormalized: "+13125550177",
        address: "14 Oak St",
      },
    });
    const before = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    await prisma.job.create({
      data: { businessId: shop.id, customerId: customer.id, title: "Tomorrow's call", status: "scheduled", scheduledAt: new Date() },
    });
    await prisma.job.create({
      data: {
        businessId: shop.id,
        customerId: customer.id,
        title: "Real repair",
        status: "completed",
        completedAt: new Date(),
        resolutionCode: "repaired",
        finalAmountCents: 12000,
      },
    });

    const yesterday = shopDay(-1);
    const job = await recordPastVisit({
      businessId: shop.id,
      customerId: customer.id,
      title: "Furnace tune-up",
      day: yesterday,
      notes: "Replaced the filter.",
      actor: { actor: "owner", actorEmail: "owner@shop.test" },
    });

    assert.equal(job.status, "completed");
    assert.equal(job.resolutionCode, PRIOR_VISIT_CODE);
    assert.equal(job.finalAmountCents, 0);
    assert.equal(job.leadId, null);
    assert.equal(job.technicianId, null);
    assert.equal(job.customerConfirmToken, null);

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    assert.equal(after.interactionCount, before.interactionCount);
    assert.equal(after.lastSeenAt.getTime(), before.lastSeenAt.getTime());

    const timeline = await getCustomerTimeline(customer.id);
    const row = timeline.find((event) => event.id === job.id);
    assert.ok(row);
    assert.equal(row.day, true);
    assert.equal(row.title, "Furnace tune-up");
    assert.match(row.summary ?? "", /filter/);
    const shown = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(row.at));
    const part = (type) => shown.find((item) => item.type === type)?.value ?? "";
    assert.equal(`${part("year")}-${part("month")}-${part("day")}`, yesterday);

    const [messages, invoices, reviews, audit] = await Promise.all([
      prisma.message.count({ where: { businessId: shop.id } }),
      prisma.invoice.count({ where: { businessId: shop.id } }),
      prisma.visitReview.count({ where: { businessId: shop.id } }),
      prisma.auditEvent.findFirst({ where: { jobId: job.id, action: "job.past_visit" } }),
    ]);
    assert.equal(messages, 0);
    assert.equal(invoices, 0);
    assert.equal(reviews, 0);
    assert.ok(audit);

    const outcomes = await getShopOutcomes(shop.id);
    assert.equal(outcomes.jobsBooked, 2);
    assert.equal(outcomes.jobsCompleted, 1);

    assert.equal(jobLifecycle(job).state, "closed");
    assert.match(jobLifecycle(job).detail, /shop's records/);
    assert.equal(jobSteps(job).some((step) => step.detail?.includes("Never confirmed")), false);
    assert.equal(jobRowFacts(job).attention, null);
    assert.equal(jobRowFacts(job).money.label, "From earlier records");

    await assert.rejects(
      () => recordPastVisit({ businessId: other.id, customerId: customer.id, title: "Not theirs", day: yesterday }),
      (error) => error instanceof PastVisitError && error.status === 404,
    );
    await assert.rejects(
      () => recordPastVisit({ businessId: shop.id, customerId: customer.id, title: "Next week", day: shopDay(2) }),
      (error) => error instanceof PastVisitError && /hasn't happened/.test(error.message),
    );
    await assert.rejects(
      () => recordPastVisit({ businessId: shop.id, customerId: customer.id, title: "Bad day", day: "2024-02-31" }),
      (error) => error instanceof PastVisitError,
    );
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
    await prisma.business.delete({ where: { id: other.id } }).catch(() => {});
  }
});
