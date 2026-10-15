import { NextResponse } from "next/server";
import { publicTechnician } from "@/lib/tech-app-link";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { requirePermission } from "@/lib/tenant";

/**
 * Shop data export — switching-cost trust: owners can leave with their records.
 * JSON download of customers, leads, jobs, estimates, invoices, payments.
 * Link tokens stay out: the file gets emailed around, and each one opens a live page.
 */
/* Largest collections come in pages so one file can't time out; the file says when there is more. */
export const EXPORT_PAGE = { leads: 5000, jobs: 5000, auditEvents: 20000 } as const;

export async function GET(request: Request) {
  const session = await requirePermission("data.export", { entitled: false });
  if ("error" in session) return session.error;

  const businessId = session.business.id;
  const page = Math.max(0, Math.floor(Number(new URL(request.url).searchParams.get("page") ?? "0")) || 0);
  const skip = (kind: keyof typeof EXPORT_PAGE) => page * EXPORT_PAGE[kind];

  const [business, customers, leads, jobs, estimates, invoices, payments, technicians, auditEvents, leadTotal, jobTotal, auditTotal] =
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
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: skip("leads"),
        take: EXPORT_PAGE.leads,
      }),
      prisma.job.findMany({
        where: { businessId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: skip("jobs"),
        take: EXPORT_PAGE.jobs,
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
      prisma.auditEvent.findMany({
        where: { businessId },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: skip("auditEvents"),
        take: EXPORT_PAGE.auditEvents,
      }),
      prisma.lead.count({ where: { businessId } }),
      prisma.job.count({ where: { businessId } }),
      prisma.auditEvent.count({ where: { businessId } }),
    ]);

  const totals = { leads: leadTotal, jobs: jobTotal, auditEvents: auditTotal };
  const more = (Object.keys(EXPORT_PAGE) as (keyof typeof EXPORT_PAGE)[]).filter((k) => (page + 1) * EXPORT_PAGE[k] < totals[k]);

  const payload = {
    exportedAt: new Date().toISOString(),
    format: "orvius-shop-export-v1",
    page,
    /* False means this file is not everything: fetch nextPage for the rest of the listed collections. */
    complete: more.length === 0 && page === 0,
    totals,
    pageSize: EXPORT_PAGE,
    continuesIn: more,
    nextPage: more.length ? `/api/account/export?page=${page + 1}` : null,
    business,
    counts: {
      customers: customers.length,
      leads: leads.length,
      jobs: jobs.length,
      estimates: estimates.length,
      invoices: invoices.length,
      payments: payments.length,
      technicians: technicians.length,
      auditEvents: auditEvents.length,
    },
    customers,
    leads,
    jobs: jobs.map(({ techToken: _t, customerConfirmToken: _c, ...job }) => job),
    estimates: estimates.map(({ publicToken: _p, ...estimate }) => estimate),
    invoices: invoices.map(({ publicToken: _p, ...invoice }) => invoice),
    payments,
    technicians: technicians.map(publicTechnician),
    auditEvents,
  };

  await recordAudit({
    businessId,
    entityType: "shop",
    entityId: businessId,
    action: "data.exported",
    actor: session.role === "owner" ? "owner" : "teammate",
    actorEmail: session.email,
    summary: `${session.email} exported shop data (${customers.length} customers, ${jobs.length} of ${jobTotal} jobs${page ? `, page ${page + 1}` : ""}).`,
  });

  const slug = business?.slug ?? "shop";
  const filename = `orvius-export-${slug}-${new Date().toISOString().slice(0, 10)}${page ? `-part${page + 1}` : ""}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
