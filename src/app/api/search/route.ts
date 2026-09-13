import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSearchFilters } from "@/lib/search-query";
import { requireEntitledSession } from "@/lib/tenant";

export type SearchHit = {
  kind: "lead" | "customer" | "job";
  id: string;
  title: string;
  detail: string;
  href: string;
};

const PER_KIND = 5;

/** One search box over the shop record: callers, customers, and jobs. */
export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const where = buildSearchFilters(business.id, q);
  if (!where) return NextResponse.json({ hits: [] });

  const [leads, customers, jobs] = await Promise.all([
    prisma.lead.findMany({
      where: where.lead,
      take: PER_KIND,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        phone: true,
        serviceType: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.customer.findMany({
      where: where.customer,
      take: PER_KIND,
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, name: true, phone: true, interactionCount: true },
    }),
    prisma.job.findMany({
      where: where.job,
      take: PER_KIND,
      orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        status: true,
        address: true,
        scheduledAt: true,
      },
    }),
  ]);

  const hits: SearchHit[] = [
    ...leads.map((lead) => ({
      kind: "lead" as const,
      id: lead.id,
      title: lead.name ?? lead.phone ?? "Caller",
      detail: [lead.serviceType, lead.phone, lead.status].filter(Boolean).join(" · "),
      href: `/dashboard/inbox/${lead.id}`,
    })),
    ...customers.map((customer) => ({
      kind: "customer" as const,
      id: customer.id,
      title: customer.name ?? customer.phone,
      detail: [
        customer.phone,
        customer.interactionCount > 1 ? `${customer.interactionCount} touches` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/dashboard/customers/${customer.id}`,
    })),
    ...jobs.map((job) => ({
      kind: "job" as const,
      id: job.id,
      title: job.title,
      detail: [job.status, job.address].filter(Boolean).join(" · "),
      href: `/dashboard/jobs/${job.id}`,
    })),
  ];

  return NextResponse.json({ hits });
}
