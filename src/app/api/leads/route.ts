import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/customer";
import { INBOX_VIEWS, inboxFacts, type InboxView } from "@/lib/inbox-state";
import { prisma } from "@/lib/prisma";
import { requireEntitledSession } from "@/lib/tenant";

const VALID_STATUSES = new Set(["new", "contacted", "booked", "lost", "spam"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status")?.trim() || null;
  const limit = Math.min(
    Number(searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT,
    MAX_LIMIT,
  );
  const cursor = searchParams.get("cursor")?.trim() || null;

  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const tenant = { businessId: business.id };

  const view = searchParams.get("view");
  if (view !== null) {
    if (view && !INBOX_VIEWS.includes(view as InboxView)) {
      return NextResponse.json({ error: "Invalid view" }, { status: 400 });
    }
    return inboxView(business.id, (view || null) as InboxView | null);
  }
  const where = status ? { ...tenant, status } : tenant;

  const leads = await prisma.lead.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    where,
    orderBy: { createdAt: "desc" },
    include: {
      business: { select: { name: true } },
      customer: { select: { id: true, name: true, interactionCount: true } },
      job: { select: { id: true, status: true } },
    },
  });

  const hasMore = leads.length > limit;
  const items = hasMore ? leads.slice(0, limit) : leads;

  return NextResponse.json({
    leads: items.map((lead) => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      serviceType: lead.serviceType,
      urgency: lead.urgency,
      address: lead.address,
      status: lead.status,
      source: lead.source,
      createdAt: lead.createdAt.toISOString(),
      business: lead.business,
      customer: lead.customer,
      job: lead.job,
    })),
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    counts: await leadCounts(tenant),
  });
}

/*
  A count for every status the inbox can filter by, not the four someone
  happened to add. Lost and Spam were missing, so those two chips rendered
  bare next to four that carried a number, and a chip with no count reads as
  a chip that failed to load rather than one holding zero.

  One grouped query rather than a count per status: this ran four in series
  on every inbox load and would have run six.
*/
async function leadCounts(tenant: { businessId: string }) {
  const grouped = await prisma.lead.groupBy({
    by: ["status"],
    where: tenant,
    _count: { _all: true },
  });
  const byStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
  const counts: Record<string, number> = {
    total: grouped.reduce((sum, row) => sum + row._count._all, 0),
  };
  for (const status of VALID_STATUSES) counts[status] = byStatus.get(status) ?? 0;
  return counts;
}

const OPEN_LIMIT = 300;
const RESOLVED_LIMIT = 60;

/*
  The four inbox filters are worked out from the request, its call and its
  text thread, not from one status column, so they are computed here over
  every open request (and the latest resolved ones) and counted together.
*/
async function inboxView(businessId: string, view: InboxView | null) {
  const include = {
    customer: { select: { id: true, name: true, interactionCount: true } },
    job: { select: { id: true, status: true } },
  } as const;
  const [open, resolved, takeovers] = await Promise.all([
    prisma.lead.findMany({
      where: { businessId, status: { in: ["new", "contacted"] } },
      orderBy: { createdAt: "desc" },
      take: OPEN_LIMIT,
      include,
    }),
    prisma.lead.findMany({
      where: { businessId, status: { in: ["booked", "lost", "spam"] } },
      orderBy: { updatedAt: "desc" },
      take: RESOLVED_LIMIT,
      include,
    }),
    prisma.takeover.findMany({
      where: { businessId, releasedAt: null },
      select: { phoneNormalized: true, leadId: true },
    }),
  ]);
  const leads = [...open, ...resolved];
  const ids = open.map((l) => l.id);
  const phones = [...new Set(open.map((l) => normalizePhone(l.phone)).filter((p): p is string => Boolean(p)))];

  const [escalations, messages] = await Promise.all([
    ids.length
      ? prisma.auditEvent.findMany({
          where: { businessId, leadId: { in: ids }, action: { in: ["lead.escalated", "lead.held"] } },
          select: { leadId: true },
        })
      : [],
    phones.length
      ? prisma.message.findMany({
          where: { businessId, phoneNormalized: { in: phones } },
          orderBy: { createdAt: "desc" },
          take: 1000,
          select: { phoneNormalized: true, direction: true, createdAt: true, readAt: true },
        })
      : [],
  ]);
  const escalated = new Set(escalations.map((e) => e.leadId));
  const latestByPhone = new Map<string, (typeof messages)[number]>();
  for (const m of messages) if (!latestByPhone.has(m.phoneNormalized)) latestByPhone.set(m.phoneNormalized, m);
  const takenPhones = new Set(takeovers.map((t) => t.phoneNormalized));
  const takenLeads = new Set(takeovers.map((t) => t.leadId).filter(Boolean));

  const rows = leads.map((lead) => {
    const phone = normalizePhone(lead.phone);
    const facts = inboxFacts({
      ...lead,
      escalated: escalated.has(lead.id),
      takenOver: takenLeads.has(lead.id) || (phone ? takenPhones.has(phone) : false),
      lastMessage: phone ? latestByPhone.get(phone) ?? null : null,
    });
    return {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      serviceType: lead.serviceType,
      urgency: lead.urgency,
      address: lead.address,
      status: lead.status,
      source: lead.source,
      createdAt: lead.createdAt.toISOString(),
      customer: lead.customer,
      job: lead.job,
      inbox: facts,
    };
  });

  const counts = Object.fromEntries(INBOX_VIEWS.map((v) => [v, rows.filter((r) => r.inbox.view === v).length])) as Record<InboxView, number>;
  const shown = view ? rows.filter((r) => r.inbox.view === view) : rows.filter((r) => r.inbox.view !== "resolved");
  return NextResponse.json({
    leads: shown,
    views: counts,
    truncated: open.length >= OPEN_LIMIT,
    generatedAt: new Date().toISOString(),
  });
}
