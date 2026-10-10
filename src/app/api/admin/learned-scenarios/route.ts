import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { holdDecisionsByLead } from "@/lib/booking-decision";
import { gradeCall } from "@/lib/call-quality";
import { verifyAdminRequest } from "@/lib/env";
import { isFounderEmail } from "@/lib/founder";
import { learnScenarios, type LearnableCall } from "@/lib/learned-scenarios";
import { prisma } from "@/lib/prisma";

/**
 * Voice-sim scenarios learned from real calls that went wrong. Founder session
 * or admin token. The response carries no caller words, names, numbers or
 * addresses (see learned-scenarios.ts). `?days=` defaults to 14, `?limit=` to 10.
 */
export async function GET(request: Request) {
  if (!verifyAdminRequest(request)) {
    const email = (await auth())?.user?.email?.toLowerCase();
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isFounderEmail(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(params.get("days")) || 14));
  const limit = Math.min(25, Math.max(1, Number(params.get("limit")) || 10));

  const calls = await prisma.call.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      business: { environment: "production" },
      transcript: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      id: true,
      businessId: true,
      status: true,
      durationSec: true,
      transcript: true,
      summary: true,
      booked: true,
      successEvaluation: true,
      business: { select: { trade: true, servicesJson: true, jobLengthsJson: true, name: true } },
      customer: { select: { address: true } },
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
          serviceType: true,
          urgency: true,
          categoryCode: true,
          notes: true,
          status: true,
          job: { select: { id: true } },
        },
      },
    },
  });

  const unbookedByShop = new Map<string, string[]>();
  for (const call of calls) {
    if (call.lead && !call.lead.job) unbookedByShop.set(call.businessId, [...(unbookedByShop.get(call.businessId) ?? []), call.lead.id]);
  }
  const holds = new Map<string, string>();
  for (const [businessId, leadIds] of unbookedByShop) {
    for (const [leadId, reason] of await holdDecisionsByLead(businessId, leadIds)) holds.set(leadId, reason);
  }

  const learnable: LearnableCall[] = calls.map((call) => {
    const business = call.business ?? {};
    return {
      id: call.id,
      transcript: call.transcript,
      summary: call.summary,
      lead: call.lead,
      business,
      grade: gradeCall({
        call,
        lead: call.lead,
        business,
        knownAddress: call.customer?.address,
        holdDecision: call.lead ? holds.get(call.lead.id) : null,
      }),
    };
  });

  const scenarios = learnScenarios(learnable, limit);
  return NextResponse.json({ days, graded: calls.length, scenarios });
}
