#!/usr/bin/env node
/**
 * Backfill jobs for leads that never got auto-booked (pre-mastery data).
 */
import { createScriptPrisma } from "./lib/db.mjs";

const prisma = createScriptPrisma();

async function main() {
  const leads = await prisma.lead.findMany({
    where: {
      job: null,
      status: { not: "spam" },
    },
    select: { id: true, businessId: true, name: true },
    take: 500,
  });

  if (!leads.length) {
    console.log("backfill:jobs — nothing to backfill");
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  for (const lead of leads) {
    const existing = await prisma.job.findFirst({ where: { leadId: lead.id } });
    if (existing) continue;

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    scheduledAt.setHours(9, 0, 0, 0);

    await prisma.$transaction(async (tx) => {
      await tx.job.create({
        data: {
          businessId: lead.businessId,
          leadId: lead.id,
          title: lead.name ? `Job for ${lead.name}` : "Service job",
          status: "scheduled",
          scheduledAt,
          notes: "Backfilled — auto-book mastery",
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { status: "booked" },
      });
    });
    created++;
  }

  console.log(`backfill:jobs — ${created}/${leads.length} leads booked`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
