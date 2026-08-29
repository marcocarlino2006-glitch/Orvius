#!/usr/bin/env node
/**
 * Backfill Customer records from existing leads and calls.
 * Run: node scripts/backfill-customers.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizePhone(phone) {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+") && digits.length >= 10) return `+${digits}`;
  return digits.length >= 7 ? digits : null;
}

async function main() {
  const leads = await prisma.lead.findMany({
    where: { businessId: { not: null }, phone: { not: null } },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let linked = 0;

  for (const lead of leads) {
    if (!lead.businessId || !lead.phone) continue;

    const phoneNormalized = normalizePhone(lead.phone);
    if (!phoneNormalized) continue;

    const customer = await prisma.customer.upsert({
      where: {
        businessId_phoneNormalized: {
          businessId: lead.businessId,
          phoneNormalized,
        },
      },
      create: {
        businessId: lead.businessId,
        phone: lead.phone,
        phoneNormalized,
        name: lead.name,
        email: lead.email,
        address: lead.address,
        notes: lead.notes,
        firstSeenAt: lead.createdAt,
        lastSeenAt: lead.createdAt,
        interactionCount: 1,
      },
      update: {
        name: lead.name ?? undefined,
        email: lead.email ?? undefined,
        address: lead.address ?? undefined,
        lastSeenAt: lead.createdAt,
        interactionCount: { increment: 0 },
      },
    });

    if (customer.createdAt.getTime() >= Date.now() - 5000) created++;

    if (!lead.customerId) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { customerId: customer.id },
      });
      linked++;
    }

    if (lead.callId) {
      await prisma.call.updateMany({
        where: { id: lead.callId, customerId: null },
        data: { customerId: customer.id },
      });
    }
  }

  const customers = await prisma.customer.findMany();
  for (const customer of customers) {
    const count = await prisma.lead.count({ where: { customerId: customer.id } });
    const callCount = await prisma.call.count({ where: { customerId: customer.id } });
    const total = count + callCount;
    if (total > customer.interactionCount) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { interactionCount: total },
      });
    }
  }

  console.log(`Backfill complete. Customers: ${customers.length}, linked leads: ${linked}, new: ~${created}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
