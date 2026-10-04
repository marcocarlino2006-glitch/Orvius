import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { personActor, recordAudit } from "@/lib/audit";
import { getAppUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  formatPlanPrice,
  listMembers,
  listPlans,
  markVisitDone,
  MAX_ACTIVE_PLANS,
  monthlyRecurringCents,
  validatePlan,
} from "@/lib/service-plans";
import { getConnectStatus } from "@/lib/stripe-connect";
import { requireEntitledSession } from "@/lib/tenant";

export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const [plans, members, shop] = await Promise.all([
    listPlans(business.id),
    listMembers(business.id),
    prisma.business.findUniqueOrThrow({
      where: { id: business.id },
      select: {
        slug: true,
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
        stripeConnectDetailsSubmitted: true,
      },
    }),
  ]);
  return NextResponse.json({
    canAcceptPayments: getConnectStatus(shop).canAcceptPayments,
    link: shop.slug ? `${getAppUrl()}/m/${shop.slug}` : null,
    mrrCents: monthlyRecurringCents(plans),
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      interval: p.interval,
      visitsPerYear: p.visitsPerYear,
      perks: p.perks,
      isActive: p.isActive,
      active: p.active,
      pastDue: p.pastDue,
    })),
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      phone: m.phone,
      status: m.status,
      plan: m.plan.name,
      price: formatPlanPrice(m.plan.priceCents, m.plan.interval),
      startedAt: m.startedAt?.toISOString() ?? null,
      nextVisitDueAt: m.nextVisitDueAt?.toISOString() ?? null,
      customerId: m.customerId,
    })),
  });
}

const CreateBody = z.object({
  name: z.string().max(80),
  priceCents: z.number().int(),
  interval: z.string(),
  visitsPerYear: z.number().int().optional(),
  perks: z.string().max(600).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business, role, email } = authResult;
  if (role !== "owner") return NextResponse.json({ error: "Only the owner can set up plans." }, { status: 403 });
  const parsed = CreateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fill in the name, price and billing." }, { status: 400 });
  const valid = validatePlan(parsed.data);
  if (!valid.ok) return NextResponse.json({ error: valid.message }, { status: 400 });

  const live = await prisma.servicePlan.count({ where: { businessId: business.id, isActive: true } });
  if (live >= MAX_ACTIVE_PLANS) {
    return NextResponse.json({ error: `Up to ${MAX_ACTIVE_PLANS} plans at once. Pause one first.` }, { status: 400 });
  }
  const plan = await prisma.servicePlan.create({ data: { businessId: business.id, ...valid.plan } });
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: plan.id,
    action: "plan.created",
    ...personActor({ role, email }),
    summary: `Created plan ${plan.name} at ${formatPlanPrice(plan.priceCents, plan.interval)}`,
  });
  return NextResponse.json({ id: plan.id });
}

const PatchBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle"), planId: z.string(), isActive: z.boolean() }),
  z.object({ action: z.literal("visit_done"), memberId: z.string() }),
]);

export async function PATCH(request: NextRequest) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business, role, email } = authResult;
  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  if (parsed.data.action === "visit_done") {
    const member = await markVisitDone({ businessId: business.id, memberId: parsed.data.memberId });
    if (!member) return NextResponse.json({ error: "Member not found." }, { status: 404 });
    return NextResponse.json({ nextVisitDueAt: member.nextVisitDueAt?.toISOString() ?? null });
  }

  if (role !== "owner") return NextResponse.json({ error: "Only the owner can change plans." }, { status: 403 });
  const { planId, isActive } = parsed.data;
  if (isActive) {
    const live = await prisma.servicePlan.count({ where: { businessId: business.id, isActive: true } });
    if (live >= MAX_ACTIVE_PLANS) {
      return NextResponse.json({ error: `Up to ${MAX_ACTIVE_PLANS} plans at once.` }, { status: 400 });
    }
  }
  const updated = await prisma.servicePlan.updateMany({ where: { id: planId, businessId: business.id }, data: { isActive } });
  if (!updated.count) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: planId,
    action: isActive ? "plan.resumed" : "plan.paused",
    ...personActor({ role, email }),
    summary: isActive ? "Plan back on sale" : "Plan taken off sale; current members keep it",
  });
  return NextResponse.json({ ok: true });
}
