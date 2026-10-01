import { randomUUID } from "node:crypto";
import type { Business } from "@prisma/client";
import { DEMO_SCENARIOS, ensureDemoWorkspace, findDemoWorkspace, simulateCustomerConfirm, simulateDemoCall } from "@/lib/demo-workspace";
import { processNotificationQueue } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { buildRequestTrace, type RequestTrace } from "@/lib/request-trace";

export const VISITOR_COOKIE = "orvius_demo_visitor";

const VISITOR_ID = /^[a-f0-9]{24}$/;

/** `.invalid` is reserved (RFC 2606): nobody can ever sign in as a visitor shop's owner. */
export function visitorOwnerEmail(visitorId: string) {
  return `visitor-${visitorId}@demo.invalid`;
}

export function newVisitorId() {
  return randomUUID().replace(/-/g, "").slice(0, 24);
}

export function isVisitorId(value: string | undefined | null): value is string {
  return Boolean(value && VISITOR_ID.test(value));
}

export function publicScenarios() {
  return DEMO_SCENARIOS.map((s) => ({ id: s.id, label: s.label, expect: s.expect, caller: s.name, transcript: s.lines }));
}

export async function visitorWorkspace(visitorId: string, create: boolean): Promise<Business | null> {
  if (!create) return findDemoWorkspace(visitorOwnerEmail(visitorId));
  return (await ensureDemoWorkspace(visitorOwnerEmail(visitorId))).business;
}

export type PublicRunResult = {
  scenario: string;
  duplicate: boolean;
  autoBooked: boolean;
  skipReason: string | null;
  trace: RequestTrace | null;
};

export async function runPublicScenario(business: Business, scenarioId: string): Promise<PublicRunResult> {
  const result = await simulateDemoCall(business, scenarioId);
  await processNotificationQueue(10, { businessId: business.id });
  const repeat = result.duplicate || result.skipReason === "existing_job";
  let leadId = result.duplicate || repeat ? null : result.leadId;
  if (!leadId) {
    const existing = await prisma.lead.findFirst({
      where: { businessId: business.id, phone: result.scenario.phone, job: { isNot: null } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    leadId = existing?.id ?? null;
  }
  return {
    scenario: result.scenario.id,
    duplicate: repeat,
    autoBooked: result.duplicate ? false : Boolean(result.autoBooked),
    skipReason: result.duplicate ? null : (result.skipReason ?? null),
    trace: leadId ? await buildRequestTrace(business.id, leadId) : null,
  };
}

export async function confirmPublicJob(business: Business, jobId: string) {
  const result = await simulateCustomerConfirm(business, jobId);
  const job = await prisma.job.findFirst({ where: { id: jobId, businessId: business.id }, select: { leadId: true } });
  return { ok: result.ok, trace: job?.leadId ? await buildRequestTrace(business.id, job.leadId) : null };
}
