import { PHONE_MICROS_PER_MIN, SMS_MICROS_PER_TEXT } from "@/lib/call-cost";
import { overageEconomicsReport, type EconCall, type EconShop, type EconText } from "@/lib/overage-economics";
import { OWNER_METHODS, collectedCents } from "@/lib/payment-math";
import { prisma } from "@/lib/prisma";
import { getRecordContract, proofLoopMetrics, type LoopJob } from "@/lib/system-of-record";

/*
  What Orvius can and can't show it did for a shop, read from the live
  records and kept in four separate boxes so none is mistaken for another:
    outcomes  — closed loops: observed, never claimed as caused by Orvius
    causal    — not measured: there is no holdout or baseline to compare with
    manual    — work and money people entered or imported themselves
    costs     — what this shop's calls and texts cost, each line saying whether
                the provider reported it or it is modelled at list rate
    missing   — data the boxes above would need and don't have
  Read-only. Nothing here changes a price, an allowance or a plan.
*/

export const PROOF_REPORT_VERSION = "proof-report-1";
const MAX_ROWS = 2000;
const DAY = 86_400_000;

function originOf(lead: { source: string } | null): LoopJob["origin"] {
  if (!lead) return "manual";
  const s = lead.source.toLowerCase();
  if (s === "call" || s === "voice-fallback") return "call";
  if (s === "sms" || s === "twilio-sms") return "sms";
  if (s === "web") return "web";
  if (s === "import") return "import";
  if (s === "demo") return "demo";
  return "manual";
}

function parseSetup(raw: string | null | undefined): { sandbox?: boolean; liveAt?: string } {
  try {
    return JSON.parse(raw || "{}") as { sandbox?: boolean; liveAt?: string };
  } catch {
    return {};
  }
}

export async function shopProofReport(businessId: string, opts: { now?: Date; windowDays?: number } = {}) {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 30;
  const since = new Date(now.getTime() - windowDays * DAY);
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { id: true, environment: true, setupJson: true } });
  const setup = parseSetup(business.setupJson);
  const liveAt = setup.liveAt ? new Date(setup.liveAt) : null;

  const [jobs, contract, calls] = await Promise.all([
    prisma.job.findMany({
      where: { businessId, createdAt: { gte: since, lt: now } },
      select: { id: true, status: true, createdAt: true, lead: { select: { source: true } }, invoices: { select: { id: true, payments: { select: { amountCents: true, status: true, method: true } } } } },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    }),
    getRecordContract(businessId),
    prisma.call.findMany({
      where: { businessId, createdAt: { gte: since, lt: now } },
      select: { id: true, durationSec: true, costMicros: true, status: true },
      take: MAX_ROWS,
    }),
  ]);
  const jobIds = jobs.map((j) => j.id);
  const invoiceIds = jobs.flatMap((j) => j.invoices.map((i) => i.id));
  const [completions, correlations, exceptions, texts] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { businessId, jobId: { in: jobIds }, action: { in: ["job.status_changed", "job.completion_corrected"] } },
      select: { jobId: true, action: true, detailJson: true },
    }),
    prisma.externalCorrelation.findMany({ where: { businessId, entityType: "job", entityId: { in: jobIds } }, select: { entityId: true, externalId: true } }),
    prisma.reconciliationException.findMany({
      where: { businessId, status: "open", OR: [{ entityType: "job", entityId: { in: jobIds } }, { entityType: "invoice", entityId: { in: invoiceIds } }] },
      select: { entityType: true, entityId: true },
    }),
    prisma.outboundSms.count({ where: { businessId, createdAt: { gte: since, lt: now } } }),
  ]);

  const completedVia = new Map<string, LoopJob["completedVia"]>();
  for (const a of completions) {
    if (!a.jobId) continue;
    if (a.action === "job.completion_corrected") completedVia.set(a.jobId, "correction");
    else if (!completedVia.has(a.jobId) && /"to":"completed"/.test(a.detailJson ?? "")) completedVia.set(a.jobId, "transition");
  }
  const externalId = new Map(correlations.map((c) => [c.entityId, c.externalId]));
  const invoiceJob = new Map(jobs.flatMap((j) => j.invoices.map((i) => [i.id, j.id] as const)));
  const openByJob = new Map<string, number>();
  for (const e of exceptions) {
    const jobId = e.entityType === "job" ? e.entityId : invoiceJob.get(e.entityId);
    if (jobId) openByJob.set(jobId, (openByJob.get(jobId) ?? 0) + 1);
  }

  const owner = new Set<string>(OWNER_METHODS);
  let manualPayments = 0;
  let manualCents = 0;
  let cardPayments = 0;
  let cardCents = 0;
  const loopJobs: LoopJob[] = jobs.map((j) => {
    const payments = j.invoices.flatMap((i) => i.payments);
    for (const p of payments) {
      if (collectedCents([p]) <= 0) continue;
      if (owner.has((p.method ?? "").toLowerCase())) {
        manualPayments++;
        manualCents += p.amountCents;
      } else {
        cardPayments++;
        cardCents += p.amountCents;
      }
    }
    return {
      id: j.id,
      businessId,
      origin: originOf(j.lead),
      createdDuringSetup: Boolean(liveAt && j.createdAt < liveAt),
      completedVia: j.status === "completed" ? (completedVia.get(j.id) ?? null) : null,
      jobPaidCents: collectedCents(payments),
      externalJobId: externalId.get(j.id) ?? null,
      openExceptions: openByJob.get(j.id) ?? 0,
    };
  });

  const outcomes = proofLoopMetrics({ shops: [{ id: business.id, environment: business.environment, setupSandbox: Boolean(setup.sandbox) }], jobs: loopJobs, contracts: { [businessId]: contract } });

  const reported = calls.filter((c) => c.costMicros != null);
  const minutes = calls.reduce((n, c) => n + Math.max(0, c.durationSec ?? 0) / 60, 0);
  const cents = (micros: number) => Math.round(micros / 10_000);
  const completedNoRecord = jobs.filter((j) => j.status === "completed" && !completedVia.has(j.id)).length;
  const missingCorrelation = contract.domains.job_state !== "orvius" ? loopJobs.filter((j) => !j.externalJobId).length : 0;

  return {
    version: PROOF_REPORT_VERSION,
    window: { start: since.toISOString(), end: now.toISOString(), days: windowDays },
    truncated: jobs.length >= MAX_ROWS || calls.length >= MAX_ROWS,
    outcomes: { ...outcomes, attribution: "observed_not_causal" as const },
    causal: { measured: false as const, why: "There is no holdout group or before-Orvius baseline for this shop, so nothing here is claimed as caused by Orvius." },
    manual: {
      jobsNotFromAnInboundRequest: loopJobs.filter((j) => j.origin === "manual" || j.origin === "import").length,
      manualPayments: { count: manualPayments, cents: manualCents, meaning: "cash, check, bank or other, entered by a person" },
      cardPayments: { count: cardPayments, cents: cardCents, meaning: "paid by card through Orvius" },
    },
    costs: {
      voice: { cents: cents(reported.reduce((n, c) => n + (c.costMicros ?? 0), 0)), source: "provider_reported" as const, calls: reported.length },
      telephony: { cents: cents(minutes * PHONE_MICROS_PER_MIN), source: "modelled_list_rate" as const },
      texts: { cents: cents(texts * SMS_MICROS_PER_TEXT), source: "modelled_list_rate" as const, count: texts },
    },
    missing: [
      { what: "calls_without_reported_cost", count: calls.length - reported.length },
      { what: "completed_jobs_without_a_recorded_completion", count: completedNoRecord },
      { what: "jobs_without_a_link_to_the_record_of_truth", count: missingCorrelation },
      { what: "self_test_jobs_not_flagged", count: null, note: "Jobs don't record whether the owner made them while testing; any such job counts as real here." },
      { what: "per_text_provider_cost", count: null, note: "Texts are costed at list rate; the provider's charge per text isn't stored." },
    ],
  };
}

/**
 * Internal: the cost side of overage economics over live shops. Subscription
 * and overage invoices live in Stripe and aren't mirrored locally, so revenue
 * and margin are reported as missing rather than as zero.
 */
export async function internalEconomicsReport(opts: { now?: Date; windowDays?: number } = {}) {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 30;
  const since = new Date(now.getTime() - windowDays * DAY);
  const [shops, calls, texts] = await Promise.all([
    prisma.business.findMany({ select: { id: true, environment: true, billingPlan: true, billingInterval: true, billingStatus: true, createdAt: true }, take: 10_000 }),
    prisma.call.findMany({ where: { createdAt: { gte: since, lt: now } }, select: { id: true, businessId: true, createdAt: true, status: true, durationSec: true, costMicros: true }, take: 50_000 }),
    prisma.outboundSms.findMany({ where: { createdAt: { gte: since, lt: now } }, select: { businessId: true, createdAt: true }, take: 50_000 }),
  ]);
  const econShops: EconShop[] = shops.map((s) => ({
    id: s.id,
    environment: s.environment === "demo" || s.environment === "test" ? s.environment : "production",
    plan: s.billingPlan,
    interval: s.billingInterval === "year" ? "year" : s.billingInterval === "month" ? "month" : null,
    billingStatus: s.billingStatus,
    pilot: s.billingStatus === "pilot",
    signupMonth: s.createdAt.toISOString().slice(0, 7),
  }));
  const econCalls: EconCall[] = calls.map((c) => ({
    id: c.id,
    businessId: c.businessId,
    at: c.createdAt.toISOString(),
    answered: (c.durationSec ?? 0) > 0,
    durationSec: c.durationSec,
    costMicros: c.costMicros,
  }));
  const econTexts: EconText[] = texts.map((t) => ({ businessId: t.businessId, at: t.createdAt.toISOString(), segments: 1 }));
  const report = overageEconomicsReport({ shops: econShops, calls: econCalls, texts: econTexts, model: [], fixed: [], invoices: [], waivers: [] }, { now, windowDays });
  return {
    ...report,
    truncated: shops.length >= 10_000 || calls.length >= 50_000 || texts.length >= 50_000,
    revenue: null,
    overage: null,
    observedMarginCents: null,
    missing: [
      { what: "subscription_and_overage_invoices", note: "In Stripe, not mirrored locally; revenue and margin aren't computed here." },
      { what: "model_spend", note: "Not metered per call yet." },
      { what: "fixed_costs", note: "Numbers, A2P and storage aren't recorded per shop." },
      { what: "text_segments", note: "Each text counts as one segment." },
    ],
  };
}
