import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { createJobFromLead } from "../src/lib/job.ts";

const prisma = new PrismaClient();

test("two simultaneous booking requests resolve to the same job", async () => {
  const business = await prisma.business.create({
    data: {
      name: "Booking Race Proof",
      slug: `booking-race-${Date.now()}`,
      billingStatus: "pilot",
    },
  });

  try {
    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        name: "One caller",
        serviceType: "No cooling",
        categoryCode: "hvac.no_cool",
        urgency: "same-day",
      },
    });
    const scheduledAt = new Date(Date.now() + 86_400_000);

    const [first, second] = await Promise.all([
      createJobFromLead({ leadId: lead.id, scheduledAt }),
      createJobFromLead({ leadId: lead.id, scheduledAt }),
    ]);

    assert.equal(first.id, second.id, "both callers receive the one real job");
    assert.equal(
      await prisma.job.count({ where: { leadId: lead.id } }),
      1,
      "the database edge remains exactly one lead to one job",
    );
  } finally {
    await prisma.business
      .delete({ where: { id: business.id } })
      .catch(() => {});
  }
});

test.after(() => prisma.$disconnect());
