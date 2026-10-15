import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

/*
  The operating-platform proof loop. Each shop has a versioned contract naming
  which system is the record of truth for each part of its work; Orvius
  records are tied to records elsewhere by correlations that are written once
  and never repointed; and when the two disagree about a create, change,
  cancel, completion or payment, a person gets one exception to resolve.

  The proof-loop metric counts only closed loops on real shops, and is
  labelled as observation: it is never causal attribution.
*/

export const RECORD_CONTRACT_VERSION = "record-contract-1";
export const RECORD_DOMAINS = ["customer", "availability", "job_state", "price_invoice", "payment_receipt", "notifications"] as const;
export type RecordDomain = (typeof RECORD_DOMAINS)[number];
export const RECORD_SYSTEMS = ["orvius", "jobber", "housecall", "servicetitan", "quickbooks", "stripe", "google_calendar", "twilio"] as const;
export type RecordSystem = (typeof RECORD_SYSTEMS)[number];
export type RecordContract = { version: number; domains: Record<RecordDomain, RecordSystem>; implicit: boolean };

const DEFAULT_DOMAINS: Record<RecordDomain, RecordSystem> = {
  customer: "orvius",
  availability: "orvius",
  job_state: "orvius",
  price_invoice: "orvius",
  payment_receipt: "stripe",
  notifications: "twilio",
};

export class RecordContractError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export function parseContractDomains(body: unknown): Record<RecordDomain, RecordSystem> {
  const input = (body ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_DOMAINS };
  for (const key of Object.keys(input)) {
    if (!(RECORD_DOMAINS as readonly string[]).includes(key)) throw new RecordContractError(`Unknown part of the record: ${key}`);
    const value = input[key];
    if (typeof value !== "string" || !(RECORD_SYSTEMS as readonly string[]).includes(value)) throw new RecordContractError(`Unknown system for ${key}`);
    out[key as RecordDomain] = value as RecordSystem;
  }
  return out;
}

/** The latest contract; a shop that never set one runs on Orvius's defaults as version 0. */
export async function getRecordContract(businessId: string): Promise<RecordContract> {
  const row = await prisma.shopRecordContract.findFirst({ where: { businessId }, orderBy: { version: "desc" } });
  if (!row) return { version: 0, domains: { ...DEFAULT_DOMAINS }, implicit: true };
  return { version: row.version, domains: { ...DEFAULT_DOMAINS, ...(JSON.parse(row.domainsJson) as Partial<Record<RecordDomain, RecordSystem>>) }, implicit: false };
}

/** A change is a new version; the old one stays as the record of what was in force. */
export async function setRecordContract(params: { businessId: string; domains: unknown; actorEmail: string }) {
  const domains = parseContractDomains(params.domains);
  const before = await getRecordContract(params.businessId);
  const version = before.version + 1;
  try {
    await prisma.shopRecordContract.create({ data: { businessId: params.businessId, version, domainsJson: JSON.stringify(domains), createdByEmail: params.actorEmail } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new RecordContractError("Someone else changed this at the same time. Reload and try again.", 409);
    throw error;
  }
  await recordAudit({
    businessId: params.businessId,
    entityType: "shop",
    entityId: params.businessId,
    action: "record_contract.updated",
    actor: "owner",
    actorEmail: params.actorEmail,
    summary: `System-of-record contract is now version ${version}`,
    detail: { before: before.domains, after: domains, version, policy: RECORD_CONTRACT_VERSION },
    idempotencyKey: `record-contract:${params.businessId}:${version}`,
  });
  return { version, domains };
}

export type CorrelationInput = { businessId: string; entityType: string; entityId: string; system: RecordSystem; externalId: string };

/**
 * Tie an Orvius record to an external one, once. The same pair again is a
 * no-op; a different pair for either side is never overwritten — it becomes a
 * reconciliation exception, because one of the two systems is now wrong.
 */
export async function correlate(input: CorrelationInput): Promise<{ ok: true; created: boolean } | { ok: false; exceptionId: string }> {
  const externalId = input.externalId.trim();
  if (!externalId) throw new RecordContractError("An external id is required.");
  const contract = await getRecordContract(input.businessId);
  try {
    await prisma.externalCorrelation.create({ data: { ...input, externalId, contractVersion: contract.version } });
    return { ok: true, created: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
  const existing = await prisma.externalCorrelation.findMany({
    where: {
      businessId: input.businessId,
      system: input.system,
      entityType: input.entityType,
      OR: [{ entityId: input.entityId }, { externalId }],
    },
  });
  if (existing.some((e) => e.entityId === input.entityId && e.externalId === externalId)) return { ok: true, created: false };
  const exceptionId = await raiseReconciliation({
    businessId: input.businessId,
    kind: "correlation",
    entityType: input.entityType,
    entityId: input.entityId,
    system: input.system,
    externalId,
    expected: existing.map((e) => ({ entityId: e.entityId, externalId: e.externalId })),
    observed: { entityId: input.entityId, externalId },
  });
  return { ok: false, exceptionId };
}

export type ReconKind = "create" | "change" | "cancel" | "complete" | "payment" | "correlation";

/** One open exception per distinct disagreement; the same disagreement seen again is not a second one. */
export async function raiseReconciliation(params: {
  businessId: string;
  kind: ReconKind;
  entityType: string;
  entityId: string;
  system: string;
  externalId?: string | null;
  expected: unknown;
  observed: unknown;
}): Promise<string> {
  const expectedJson = JSON.stringify(params.expected ?? null);
  const observedJson = JSON.stringify(params.observed ?? null);
  const dedupeKey = createHash("sha256")
    .update([params.businessId, params.kind, params.entityType, params.entityId, params.system, expectedJson, observedJson].join("\u0000"))
    .digest("hex");
  const row = await prisma.reconciliationException.upsert({
    where: { dedupeKey },
    create: { businessId: params.businessId, kind: params.kind, entityType: params.entityType, entityId: params.entityId, system: params.system, externalId: params.externalId ?? null, expectedJson, observedJson, dedupeKey },
    update: {},
  });
  return row.id;
}

export async function resolveReconciliation(params: { businessId: string; id: string; actorEmail: string; resolution: string }) {
  const resolution = params.resolution.trim();
  if (!resolution) throw new RecordContractError("Say how it was resolved.");
  const done = await prisma.reconciliationException.updateMany({
    where: { id: params.id, businessId: params.businessId, status: "open" },
    data: { status: "resolved", resolvedBy: params.actorEmail, resolution, resolvedAt: new Date() },
  });
  if (!done.count) throw new RecordContractError("That exception is already resolved or isn't this shop's.", 409);
}

export type JobSnapshot = { status: string; scheduledAt: string | null; totalCents: number | null; paidCents: number | null };

/**
 * Compare Orvius's job with what the record-of-truth system says. Pure.
 * Returns the kinds of disagreement; nothing is changed on either side.
 */
export function diffJob(orvius: JobSnapshot | null, external: JobSnapshot | null): ReconKind[] {
  if (!orvius && !external) return [];
  if (!orvius || !external) return ["create"];
  const kinds: ReconKind[] = [];
  const cancelled = (s: string) => s === "cancelled";
  const completed = (s: string) => s === "completed";
  if (cancelled(orvius.status) !== cancelled(external.status)) kinds.push("cancel");
  else if (completed(orvius.status) !== completed(external.status)) kinds.push("complete");
  if (!cancelled(orvius.status) && !cancelled(external.status) && (orvius.scheduledAt ?? null) !== (external.scheduledAt ?? null)) kinds.push("change");
  if ((orvius.totalCents ?? null) !== (external.totalCents ?? null) || (orvius.paidCents ?? 0) !== (external.paidCents ?? 0)) kinds.push("payment");
  return kinds;
}

/** Record each disagreement for one job against the system that owns job state. */
export async function reconcileJob(params: { businessId: string; jobId: string; system: RecordSystem; externalId: string | null; orvius: JobSnapshot | null; external: JobSnapshot | null }) {
  const kinds = diffJob(params.orvius, params.external);
  const ids: string[] = [];
  for (const kind of kinds) {
    ids.push(
      await raiseReconciliation({
        businessId: params.businessId,
        kind,
        entityType: "job",
        entityId: params.jobId,
        system: params.system,
        externalId: params.externalId,
        expected: params.orvius,
        observed: params.external,
      }),
    );
  }
  return { kinds, exceptionIds: ids };
}

/** Existing integration sync rows, as the correlations they imply. Pure; nothing is written. */
export function correlationsFromSyncRows(rows: {
  jobber?: { businessId: string; leadId: string; status: string; jobberClientId: string | null; jobberRequestId: string | null }[];
  quickbooks?: { businessId: string; sourceType: string; sourceId: string; status: string; qbReceiptId: string | null }[];
}): CorrelationInput[] {
  const out: CorrelationInput[] = [];
  for (const r of rows.jobber ?? []) {
    if (r.status !== "done") continue;
    if (r.jobberRequestId) out.push({ businessId: r.businessId, entityType: "lead", entityId: r.leadId, system: "jobber", externalId: r.jobberRequestId });
  }
  for (const r of rows.quickbooks ?? []) {
    if (r.status === "done" && r.qbReceiptId) out.push({ businessId: r.businessId, entityType: r.sourceType, entityId: r.sourceId, system: "quickbooks", externalId: r.qbReceiptId });
  }
  return out;
}

/* ---------- Proof-loop metric (pure) ---------- */

export type LoopShop = { id: string; environment: string; setupSandbox?: boolean };
export type LoopJob = {
  id: string;
  businessId: string;
  /** Where the request started. Only a real inbound counts; "manual" and "import" never do. */
  origin: "call" | "sms" | "web" | "manual" | "import" | "demo";
  selfTest?: boolean;
  createdDuringSetup?: boolean;
  completedVia: "transition" | "correction" | null;
  /** Money tied to this job by a payment record on its own invoice. */
  jobPaidCents: number;
  /** Money that only matches by shop total or date, not this job. */
  aggregatePaymentOnly?: boolean;
  externalJobId?: string | null;
  openExceptions: number;
};

export const PROOF_LOOP_EXCLUSIONS = ["demo_or_test_shop", "setup_sandbox", "self_test", "account_creation", "not_inbound", "aggregate_payment", "no_completion", "unpaid", "correction_completion", "missing_correlation", "open_exception"] as const;

/**
 * A proof loop is one real job that a real customer started, a person
 * completed through the job transition, money was taken for against that job,
 * the record-of-truth system agrees with, and nothing is left open. The count
 * of jobs whose lead came from a call or text is reported beside it as an
 * association only.
 */
export function proofLoopMetrics(input: { shops: LoopShop[]; jobs: LoopJob[]; contracts: Record<string, RecordContract | undefined> }) {
  const shops = new Map(input.shops.map((s) => [s.id, s]));
  const excluded = Object.fromEntries(PROOF_LOOP_EXCLUSIONS.map((k) => [k, 0])) as Record<(typeof PROOF_LOOP_EXCLUSIONS)[number], number>;
  const closed: string[] = [];
  let leadSourced = 0;
  for (const job of input.jobs) {
    const shop = shops.get(job.businessId);
    const reason = (() => {
      if (!shop || shop.environment !== "production" || job.origin === "demo") return "demo_or_test_shop";
      if (shop.setupSandbox) return "setup_sandbox";
      if (job.selfTest) return "self_test";
      if (job.createdDuringSetup) return "account_creation";
      if (job.origin !== "call" && job.origin !== "sms" && job.origin !== "web") return "not_inbound";
      return null;
    })();
    if (reason) {
      excluded[reason]++;
      continue;
    }
    if (job.origin === "call" || job.origin === "sms") leadSourced++;
    const contract = input.contracts[job.businessId];
    const owner = contract?.domains.job_state ?? "orvius";
    const loopReason = (() => {
      if (job.aggregatePaymentOnly && job.jobPaidCents <= 0) return "aggregate_payment";
      if (!job.completedVia) return "no_completion";
      if (job.completedVia === "correction") return "correction_completion";
      if (job.jobPaidCents <= 0) return "unpaid";
      if (owner !== "orvius" && !job.externalJobId) return "missing_correlation";
      if (job.openExceptions > 0) return "open_exception";
      return null;
    })();
    if (loopReason) excluded[loopReason]++;
    else closed.push(job.id);
  }
  return {
    version: RECORD_CONTRACT_VERSION,
    attribution: "observed_not_causal" as const,
    closedLoops: closed.length,
    closedJobIds: closed,
    leadSourcedJobs: { count: leadSourced, meaning: "association only: a job whose request came by call or text, not proof Orvius caused it" },
    excluded,
  };
}
