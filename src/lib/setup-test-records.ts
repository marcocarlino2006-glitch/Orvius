import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

/*
  Everything a test call leaves behind. Settings, the team and the owner's
  choices are real and stay; calls, requests, customers, jobs and the texts
  about them were simulated, so none of it may follow the shop into
  production, where it would read as real work and a real customer.
*/
export async function clearTestRecords(businessId: string, db: Db = prisma): Promise<void> {
  const where = { businessId };
  await db.jobLineItem.deleteMany({ where });
  await db.jobNote.deleteMany({ where });
  await db.jobPhoto.deleteMany({ where });
  await db.deposit.deleteMany({ where });
  await db.payment.deleteMany({ where });
  await db.invoice.deleteMany({ where });
  await db.estimate.deleteMany({ where });
  await db.job.deleteMany({ where });
  await db.lead.deleteMany({ where });
  await db.call.deleteMany({ where });
  await db.message.deleteMany({ where });
  await db.customer.deleteMany({ where });
  await db.outboundSms.deleteMany({ where });
  await db.ownerNotification.deleteMany({ where });
  await db.copilotAction.deleteMany({ where });
  await db.takeover.deleteMany({ where });
  await db.webhookEvent.deleteMany({ where });
  await db.auditEvent.deleteMany({ where: { businessId, NOT: { action: { startsWith: "setup." } } } });
}
