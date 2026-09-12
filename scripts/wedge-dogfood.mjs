#!/usr/bin/env node
/**
 * Local dogfood seed for wedge mastery (dev/sqlite only).
 * Does NOT fake production Twilio. Assigns a reserved +1555 test line
 * so checks 2–7 can be exercised without carrier keys.
 *
 * Usage: npm run wedge:dogfood
 */
import { createScriptPrisma } from "./lib/db.mjs";

const prisma = createScriptPrisma();
const DEV_LINE = "+15555550100";

function assertDevSafe() {
  const url = process.env.DATABASE_URL ?? "";
  if (process.env.NODE_ENV === "production") {
    throw new Error("wedge-dogfood refused: NODE_ENV=production");
  }
  if (!url.includes("file:") && !url.includes("sqlite") && !url.includes("dev.db")) {
    throw new Error(
      "wedge-dogfood refused: only for local sqlite DATABASE_URL (file:…/dev.db)",
    );
  }
}

async function main() {
  assertDevSafe();

  const email = (process.env.ORVIUS_OWNER_EMAIL || "dogfood@orvius.im").toLowerCase();
  const rawOwner = (process.env.ORVIUS_OWNER_PHONE || "").trim();
  const ownerPhone =
    !rawOwner || rawOwner.includes("YOUR_CELL") || rawOwner.includes("5555555")
      ? "+15555550199"
      : rawOwner;

  let business = await prisma.business.findFirst({
    where: { ownerEmail: email, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!business) {
    business = await prisma.business.create({
      data: {
        name: "Dogfood HVAC",
        slug: `dogfood-hvac-${Date.now().toString(36)}`,
        ownerEmail: email,
        ownerPhone,
        greeting: "Thanks for calling Dogfood HVAC.",
        twilioPhone: DEV_LINE,
        vapiPhoneNumber: DEV_LINE,
        vapiAssistantId: "dogfood-assistant",
        billingStatus: "pilot",
        isActive: true,
      },
    });
    console.log("Created dogfood shop", business.id);
  } else {
    business = await prisma.business.update({
      where: { id: business.id },
      data: {
        ownerPhone,
        twilioPhone: business.twilioPhone || DEV_LINE,
        vapiPhoneNumber: business.vapiPhoneNumber || DEV_LINE,
        vapiAssistantId: business.vapiAssistantId || "dogfood-assistant",
      },
    });
    console.log("Updated dogfood shop", business.id);
  }

  const callId = `dogfood-call-${business.id}`;
  const completedCall = await prisma.call.upsert({
    where: { id: callId },
    create: {
      id: callId,
      businessId: business.id,
      status: "completed",
      callerPhone: "+15555550200",
      direction: "inbound",
    },
    update: { status: "completed" },
  });

  if (!business.lineVerifiedAt) {
    business = await prisma.business.update({
      where: { id: business.id },
      data: { lineVerifiedAt: completedCall.createdAt },
    });
  }

  await prisma.ownerNotification.upsert({
    where: {
      businessId_dedupeKey_channel: {
        businessId: business.id,
        dedupeKey: `test-alert:${business.id}:dogfood`,
        channel: "sms",
      },
    },
    create: {
      businessId: business.id,
      channel: "sms",
      status: "sent",
      dedupeKey: `test-alert:${business.id}:dogfood`,
      message: "Dogfood test alert",
      ownerPhone,
      processedAt: new Date(),
    },
    update: {
      status: "sent",
      message: "Dogfood test alert",
      processedAt: new Date(),
    },
  });

  let lead = await prisma.lead.findFirst({
    where: { businessId: business.id, phone: "+15555550200" },
    orderBy: { createdAt: "desc" },
  });
  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        callId,
        phone: "+15555550200",
        name: "Dogfood Caller",
        serviceType: "AC not cooling",
        address: "100 Test St",
        source: "call",
        status: "new",
      },
    });
  }

  const existingJob = await prisma.job.findFirst({
    where: { businessId: business.id, status: { not: "cancelled" } },
  });
  if (!existingJob) {
    await prisma.job.create({
      data: {
        businessId: business.id,
        leadId: lead.id,
        title: "AC not cooling",
        serviceType: "AC not cooling",
        status: "scheduled",
        address: "100 Test St",
        notes: "Dogfood auto-book",
      },
    });
  }

  console.log("\nDogfood fixtures ready (local stub line — not a live Twilio number).");
  console.log("  shop:", business.name);
  console.log("  line:", business.vapiPhoneNumber || business.twilioPhone);
  console.log("  owner:", business.ownerPhone);
  console.log("  verified:", Boolean(business.lineVerifiedAt));
  console.log("\nNext: npm run wedge:ready\n");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
