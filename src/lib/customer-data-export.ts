import { personActor, recordAudit } from "@/lib/audit";
import { findCustomerFootprint } from "@/lib/forget-customer";
import { prisma } from "@/lib/prisma";

/*
  A customer asking what the shop holds about them. Everything forgetCustomer
  would delete is here, plus the invoices and STOP record it keeps, so the
  answer to "what do you have on me" is complete. Internal ids, tokens and
  provider costs are left out: they describe our systems, not the person.
*/
export async function exportCustomerData(params: { businessId: string; customerId: string; actorEmail: string; role: string }) {
  const footprint = await findCustomerFootprint(params.businessId, params.customerId);
  if (!footprint) return null;
  const { phoneNormalized, leadIds, callIds, jobIds } = footprint;
  const businessId = params.businessId;

  const [shop, customer, calls, requests, jobs, invoices, texts, sent, plans, optOut] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }),
    prisma.customer.findUnique({
      where: { id: params.customerId },
      select: {
        name: true,
        phone: true,
        email: true,
        address: true,
        addressesJson: true,
        equipmentJson: true,
        notes: true,
        marketingOptInAt: true,
        firstSeenAt: true,
        lastSeenAt: true,
      },
    }),
    prisma.call.findMany({
      where: { id: { in: callIds } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, direction: true, channel: true, durationSec: true, summary: true, transcript: true, recordingUrl: true },
    }),
    prisma.lead.findMany({
      where: { id: { in: leadIds } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, name: true, phone: true, email: true, address: true, serviceType: true, urgency: true, notes: true, status: true, source: true },
    }),
    prisma.job.findMany({
      where: { id: { in: jobIds } },
      orderBy: { createdAt: "asc" },
      select: { title: true, serviceType: true, address: true, notes: true, status: true, scheduledAt: true, completedAt: true, finalAmountCents: true },
    }),
    prisma.invoice.findMany({
      where: { businessId, jobId: { in: jobIds } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, amountCents: true, taxCents: true, status: true, sentAt: true, paidAt: true },
    }),
    prisma.message.findMany({
      where: { businessId, phoneNormalized },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, direction: true, author: true, body: true },
    }),
    prisma.outboundSms.findMany({
      where: { businessId, toNormalized: phoneNormalized },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, body: true },
    }),
    prisma.planMember.findMany({
      where: { businessId, phoneNormalized },
      select: { name: true, email: true, status: true, startedAt: true, canceledAt: true, plan: { select: { name: true } } },
    }),
    prisma.smsOptOut.findFirst({ where: { businessId, phoneNormalized }, select: { createdAt: true } }),
  ]);
  if (!customer) return null;

  await recordAudit({
    businessId,
    entityType: "customer",
    entityId: params.customerId,
    customerId: params.customerId,
    action: "customer.exported",
    ...personActor({ role: params.role, email: params.actorEmail }),
    summary: `${params.actorEmail} downloaded a customer's data`,
  });

  return {
    about: `Everything ${shop?.name ?? "this shop"} holds about this customer in Orvius.`,
    exportedAt: new Date().toISOString(),
    customer,
    calls,
    requests,
    jobs,
    invoices,
    texts,
    automatedTexts: sent,
    plans,
    textingOptOut: optOut ? { optedOutAt: optOut.createdAt } : null,
  };
}
