import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { createOwnerJob } from "../src/lib/job.ts";
import { getMonthValue } from "../src/lib/month-value.ts";

const prisma = new PrismaClient();

test("an owner-booked job gets a customer and a tech but no lead, so Orvius takes no credit", async () => {
  const business = await prisma.business.create({
    data: { name: "Owner Book Proof", slug: `owner-book-${Date.now()}`, billingStatus: "pilot" },
  });
  try {
    const tech = await prisma.technician.create({
      data: { businessId: business.id, name: "Ray", phone: "+15555550141" },
    });
    const scheduledAt = new Date(Date.now() + 2 * 86_400_000);
    const job = await createOwnerJob({
      businessId: business.id,
      name: "Walk-in Wanda",
      phone: "(555) 555-0177",
      serviceType: "Drain backup",
      address: "1 Main St",
      scheduledAt,
    });

    assert.equal(job.leadId, null);
    assert.equal(job.status, "scheduled");
    assert.equal(job.technicianId, tech.id, "auto-assign still runs for owner work");
    const customer = await prisma.customer.findFirst({ where: { businessId: business.id } });
    assert.equal(customer?.phoneNormalized, "+15555550177");
    assert.equal(job.customerId, customer?.id);

    const booked = await prisma.auditEvent.findFirst({
      where: { jobId: job.id, action: "job.booked" },
    });
    assert.equal(booked?.actor, "owner");

    const value = await getMonthValue(business.id);
    assert.equal(value.jobsBooked, 0);
    assert.equal(value.leadsCaptured, 0);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a chosen tech is kept rather than re-picked", async () => {
  const business = await prisma.business.create({
    data: { name: "Owner Pick Proof", slug: `owner-pick-${Date.now()}`, billingStatus: "pilot" },
  });
  try {
    await prisma.technician.create({ data: { businessId: business.id, name: "Ann", phone: "+15555550151" } });
    const picked = await prisma.technician.create({
      data: { businessId: business.id, name: "Zed", phone: "+15555550152" },
    });
    const job = await createOwnerJob({
      businessId: business.id,
      phone: "5555550178",
      serviceType: "Tune-up",
      scheduledAt: new Date(Date.now() + 3 * 86_400_000),
      technicianId: picked.id,
    });
    assert.equal(job.technicianId, picked.id);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test.after(() => prisma.$disconnect());
