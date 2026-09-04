import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireBusinessSession } from "@/lib/tenant";

/**
 * Shop data export — switching-cost trust: owners can leave with their records.
 * JSON download of customers, leads, jobs, estimates, invoices, payments.
 */
export async function GET() {
  const session = await requireBusinessSession();
  if ("error" in session) return session.error;

  const businessId = session.business.id;

  const [business, customers, leads, jobs, estimates, invoices, payments, technicians] =
    await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          name: true,
          slug: true,
          ownerPhone: true,
          ownerEmail: true,
          timezone: true,
          avgTicketCents: true,
          baselineMissedCallsPerWeek: true,
          baselineJobsPerWeek: true,
          twilioPhone: true,
          vapiPhoneNumber: true,
          billingStatus: true,
          billingPlan: true,
          createdAt: true,
        },
      }),
      prisma.customer.findMany({
        where: { businessId },
        orderBy: { lastSeenAt: "desc" },
      }),
      prisma.lead.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      prisma.job.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      prisma.estimate.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.invoice.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({
        where: { businessId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.technician.findMany({
        where: { businessId },
        orderBy: { name: "asc" },
      }),
    ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: "orvius-shop-export-v1",
    business,
    counts: {
      customers: customers.length,
      leads: leads.length,
      jobs: jobs.length,
      estimates: estimates.length,
      invoices: invoices.length,
      payments: payments.length,
      technicians: technicians.length,
    },
    customers,
    leads,
    jobs,
    estimates,
    invoices,
    payments,
    technicians,
  };

  const slug = business?.slug ?? "shop";
  const filename = `orvius-export-${slug}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
