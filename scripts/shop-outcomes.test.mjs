import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  formatWeeklyProof,
  getShopOutcomes,
} from "../src/lib/shop-outcomes.ts";

const prisma = new PrismaClient();

test("economics attributes only jobs linked to captured call/SMS demand", async () => {
  const business = await prisma.business.create({
    data: {
      name: "Attribution Proof Shop",
      slug: `attribution-proof-${Date.now()}`,
      avgTicketCents: 50_000,
      // A baseline can provide context, but must never manufacture attribution.
      baselineJobsPerWeek: 0,
      baselineMissedCallsPerWeek: 20,
    },
  });

  try {
    const call = await prisma.call.create({
      data: {
        businessId: business.id,
        vapiCallId: `attribution_call_${Date.now()}`,
        status: "completed",
        booked: true,
      },
    });
    const callLead = await prisma.lead.create({
      data: {
        businessId: business.id,
        callId: call.id,
        source: "call",
        serviceType: "No cooling",
      },
    });
    const smsLead = await prisma.lead.create({
      data: {
        businessId: business.id,
        source: "sms",
        serviceType: "Water heater",
      },
    });
    const demoLead = await prisma.lead.create({
      data: {
        businessId: business.id,
        source: "demo",
        serviceType: "Breaker",
      },
    });
    const manualLead = await prisma.lead.create({
      data: {
        businessId: business.id,
        source: "manual",
        serviceType: "Maintenance",
      },
    });

    await prisma.job.createMany({
      data: [
        {
          businessId: business.id,
          leadId: callLead.id,
          title: "Call-captured job",
        },
        {
          businessId: business.id,
          leadId: smsLead.id,
          title: "SMS-captured job",
        },
        {
          businessId: business.id,
          leadId: demoLead.id,
          title: "Demo job",
        },
        {
          businessId: business.id,
          leadId: manualLead.id,
          title: "Manual job",
        },
      ],
    });

    const outcomes = await getShopOutcomes(business.id, 7);
    assert.equal(outcomes.jobsBooked, 4, "all real CRM jobs stay in total jobs");
    assert.equal(
      outcomes.capturedDemandJobs,
      2,
      "only production call/SMS leads are attributed to captured demand",
    );
    assert.equal(
      outcomes.capturedDemandEstimatedValueCents,
      100_000,
      "dollars are measured count × owner avg ticket, never baseline lift",
    );
    assert.equal(
      outcomes.jobsPerWeekVsBaseline,
      4,
      "owner baseline remains available as context",
    );

    const proof = formatWeeklyProof(outcomes, business.name);
    assert.match(proof, /Booked from captured demand: 2/);
    assert.match(proof, /Estimated value at owner avg ticket: \$1000/);
    assert.match(proof, /context, not attribution/);
    assert.doesNotMatch(proof, /Recovered revenue/);
    assert.doesNotMatch(proof, /via baseline_jobs/);
  } finally {
    await prisma.business
      .delete({ where: { id: business.id } })
      .catch(() => {});
  }
});

test.after(() => prisma.$disconnect());
