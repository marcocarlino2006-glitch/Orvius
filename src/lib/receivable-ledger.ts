/*
  Canonical job receivables (prepared, not wired into any live path).

  NOT AUTHORITATIVE. The financial source of truth is Invoice, Payment and
  Deposit (invoice-pay.ts, payment-record.ts, booking-deposit.ts,
  payment-refund.ts); scripts/money-invariants.test.mjs proves they hold the
  invariants below and that nothing in src imports this module. Adopting it
  would mean migrating those paths onto it, not running it beside them.

  One canonical receivable per shop and job, with immutable issued revisions
  and append-only money facts. Deposits stay deposits: applying one to a job
  is a dated fact pointing at the deposit, never a rewrite of it. Plan charges
  are their own non-canonical receivables. Before money arrives a receivable
  is revised by superseding the issued revision; after, the receipt stands and
  the difference is an adjustment, credit or refund with a reason.

  Runs against a libsql client because the tables live in
  prisma/prepared/receivables-v1.sql, not in the Prisma schema.
*/
import { randomUUID } from "node:crypto";

export const RECEIVABLES_SCHEMA_VERSION = "receivables-v1";

type Arg = string | number | null;
type Stmt = { sql: string; args: Arg[] };
type Row = Record<string, unknown>;
export type ReceivableDb = {
  execute(stmt: Stmt): Promise<{ rows: Row[]; rowsAffected: number }>;
  batch(stmts: Stmt[], mode: "write"): Promise<unknown>;
};

export class ReceivableError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export type Pricing = { subtotalCents: number; taxCents?: number; taxBps?: number; lines?: unknown[] };
export type FactKind = "payment" | "deposit_application" | "adjustment" | "credit" | "refund" | "checkout_attempt";

const id = () => randomUUID();
const iso = (d: Date) => d.toISOString();
const num = (v: unknown) => Number(v ?? 0);

function revisionInsert(receivableId: string, revision: number, p: Pricing, at: Date): Stmt {
  const tax = p.taxCents ?? 0;
  if (!Number.isInteger(p.subtotalCents) || p.subtotalCents < 0 || !Number.isInteger(tax) || tax < 0) {
    throw new ReceivableError("Amounts must be whole cents, zero or more.", 422);
  }
  return {
    sql: `INSERT INTO "ReceivableRevision" ("id","receivableId","revision","status","subtotalCents","taxCents","taxBps","totalCents","linesJson","issuedAt")
          VALUES (?,?,?,'issued',?,?,?,?,?,?)`,
    args: [id(), receivableId, revision, p.subtotalCents, tax, p.taxBps ?? 0, p.subtotalCents + tax, JSON.stringify(p.lines ?? []), iso(at)],
  };
}

/** The canonical receivable for a job, created with revision 1 if there is none. */
export async function openCanonicalReceivable(db: ReceivableDb, params: { businessId: string; jobId: string; pricing: Pricing; at?: Date }) {
  const existing = await canonicalFor(db, params.businessId, params.jobId);
  if (existing) return { receivableId: existing, created: false };
  const receivableId = id();
  try {
    await db.batch(
      [
        { sql: `INSERT INTO "JobReceivable" ("id","businessId","jobId","canonical","kind") VALUES (?,?,?,1,'job')`, args: [receivableId, params.businessId, params.jobId] },
        revisionInsert(receivableId, 1, params.pricing, params.at ?? new Date()),
      ],
      "write",
    );
  } catch (error) {
    const raced = await canonicalFor(db, params.businessId, params.jobId);
    if (raced) return { receivableId: raced, created: false };
    throw error;
  }
  return { receivableId, created: true };
}

/** A receivable with no job, or an extra beside the canonical one: many may exist. */
export async function openPlanCharge(db: ReceivableDb, params: { businessId: string; pricing: Pricing; at?: Date }) {
  const receivableId = id();
  await db.batch(
    [
      { sql: `INSERT INTO "JobReceivable" ("id","businessId","jobId","canonical","kind") VALUES (?,?,NULL,0,'plan_charge')`, args: [receivableId, params.businessId] },
      revisionInsert(receivableId, 1, params.pricing, params.at ?? new Date()),
    ],
    "write",
  );
  return { receivableId };
}

async function canonicalFor(db: ReceivableDb, businessId: string, jobId: string): Promise<string | null> {
  const { rows } = await db.execute({ sql: `SELECT "id" FROM "JobReceivable" WHERE "businessId"=? AND "jobId"=? AND "canonical"=1`, args: [businessId, jobId] });
  return rows[0] ? String(rows[0].id) : null;
}

export async function currentRevision(db: ReceivableDb, receivableId: string) {
  const { rows } = await db.execute({
    sql: `SELECT "revision","totalCents" FROM "ReceivableRevision" WHERE "receivableId"=? AND "status"='issued'`,
    args: [receivableId],
  });
  if (!rows[0]) throw new ReceivableError("This receivable has no issued revision.", 404);
  return { revision: num(rows[0].revision), totalCents: num(rows[0].totalCents) };
}

async function hasMoney(db: ReceivableDb, receivableId: string) {
  const { rows } = await db.execute({
    sql: `SELECT 1 FROM "ReceivableFact" WHERE "receivableId"=? AND "kind" IN ('payment','deposit_application') LIMIT 1`,
    args: [receivableId],
  });
  return rows.length > 0;
}

/**
 * New price before any money: the issued revision is superseded and the next
 * one issued, atomically. After money it refuses — the receipt stands, and the
 * change is an adjustment, credit or refund.
 */
export async function reviseReceivable(db: ReceivableDb, params: { receivableId: string; pricing: Pricing; at?: Date }) {
  if (await hasMoney(db, params.receivableId)) {
    throw new ReceivableError("Money has been taken against this bill. Keep the receipt and record an adjustment or refund instead.");
  }
  const at = params.at ?? new Date();
  const { revision } = await currentRevision(db, params.receivableId);
  await db.batch(
    [
      {
        sql: `UPDATE "ReceivableRevision" SET "status"='superseded',"supersededAt"=?,"supersededByRevision"=? WHERE "receivableId"=? AND "revision"=? AND "status"='issued'`,
        args: [iso(at), revision + 1, params.receivableId, revision],
      },
      revisionInsert(params.receivableId, revision + 1, params.pricing, at),
    ],
    "write",
  );
  return { revision: revision + 1 };
}

async function businessOf(db: ReceivableDb, receivableId: string) {
  const { rows } = await db.execute({ sql: `SELECT "businessId" FROM "JobReceivable" WHERE "id"=?`, args: [receivableId] });
  if (!rows[0]) throw new ReceivableError("No such receivable.", 404);
  return String(rows[0].businessId);
}

async function insertFact(
  db: ReceivableDb,
  f: { receivableId: string; revision: number; kind: FactKind; amountCents: number; at: Date; depositId?: string | null; legacyPaymentId?: string | null; checkoutSessionId?: string | null; exception?: string | null; reason?: string | null; actor?: string | null },
) {
  if (!Number.isInteger(f.amountCents) || f.amountCents < 0) throw new ReceivableError("Amounts must be whole cents, zero or more.", 422);
  if ((f.kind === "adjustment" || f.kind === "credit" || f.kind === "refund") && !f.reason?.trim()) {
    throw new ReceivableError("Say why.", 422);
  }
  const factId = id();
  await db.execute({
    sql: `INSERT INTO "ReceivableFact" ("id","businessId","receivableId","revision","kind","amountCents","depositId","legacyPaymentId","checkoutSessionId","exception","reason","actor","occurredAt")
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [factId, await businessOf(db, f.receivableId), f.receivableId, f.revision, f.kind, f.amountCents, f.depositId ?? null, f.legacyPaymentId ?? null, f.checkoutSessionId ?? null, f.exception ?? null, f.reason?.trim() ?? null, f.actor ?? null, iso(f.at)],
  });
  return factId;
}

/** Adjustment or credit lowers what is owed; a refund returns money taken. Each needs a reason. */
export async function recordCorrection(db: ReceivableDb, params: { receivableId: string; kind: "adjustment" | "credit" | "refund"; amountCents: number; reason: string; actor: string; at?: Date }) {
  const { revision } = await currentRevision(db, params.receivableId);
  return insertFact(db, { ...params, revision, at: params.at ?? new Date() });
}

/**
 * Apply part or all of a paid deposit to a job's bill, dated. The deposit row is
 * never changed; across all bills its applications can't exceed what was paid.
 */
export async function applyDeposit(db: ReceivableDb, params: { receivableId: string; deposit: { id: string; amountCents: number; status: string }; amountCents: number; actor: string; at?: Date }) {
  if (params.deposit.status !== "paid") throw new ReceivableError("Only a paid deposit can be applied.");
  const { rows } = await db.execute({
    sql: `SELECT COALESCE(SUM("amountCents"),0) AS used FROM "ReceivableFact" WHERE "depositId"=? AND "kind"='deposit_application'`,
    args: [params.deposit.id],
  });
  if (num(rows[0]?.used) + params.amountCents > params.deposit.amountCents) {
    throw new ReceivableError("That's more than is left on the deposit.", 422);
  }
  const { revision } = await currentRevision(db, params.receivableId);
  return insertFact(db, { receivableId: params.receivableId, revision, kind: "deposit_application", amountCents: params.amountCents, depositId: params.deposit.id, actor: params.actor, at: params.at ?? new Date() });
}

/** A checkout session is bound to the revision it was opened for. */
export async function recordCheckoutAttempt(db: ReceivableDb, params: { receivableId: string; sessionId: string; amountCents: number; at?: Date }) {
  const { revision } = await currentRevision(db, params.receivableId);
  return insertFact(db, { receivableId: params.receivableId, revision, kind: "checkout_attempt", amountCents: params.amountCents, checkoutSessionId: params.sessionId, at: params.at ?? new Date() });
}

/**
 * The provider says a session paid. The money is real, so it is always
 * recorded — once per session. A session opened for a revision that has since
 * been superseded is a reconciled exception, not a silent overwrite; paying
 * past the balance is flagged as overpaid. Neither refunds anything by itself.
 */
export async function recordCheckoutPayment(db: ReceivableDb, params: { sessionId: string; amountCents: number; at?: Date }) {
  const { rows } = await db.execute({
    sql: `SELECT "receivableId","revision" FROM "ReceivableFact" WHERE "checkoutSessionId"=? AND "kind"='checkout_attempt'`,
    args: [params.sessionId],
  });
  if (!rows[0]) throw new ReceivableError("No checkout attempt for this session.", 404);
  const receivableId = String(rows[0].receivableId);
  const sessionRevision = num(rows[0].revision);
  const dup = await db.execute({ sql: `SELECT "id" FROM "ReceivableFact" WHERE "checkoutSessionId"=? AND "kind"='payment'`, args: [params.sessionId] });
  if (dup.rows[0]) return { factId: String(dup.rows[0].id), duplicate: true, exception: null };
  const before = await receivableBalance(db, receivableId);
  const exception = sessionRevision !== before.revision ? "late_old_session" : params.amountCents > before.balanceCents ? "overpaid" : null;
  const factId = await insertFact(db, { receivableId, revision: sessionRevision, kind: "payment", amountCents: params.amountCents, checkoutSessionId: params.sessionId, exception, at: params.at ?? new Date() });
  return { factId, duplicate: false, exception };
}

/** What is owed on the issued revision, from facts only. */
export async function receivableBalance(db: ReceivableDb, receivableId: string) {
  const { revision, totalCents } = await currentRevision(db, receivableId);
  const { rows } = await db.execute({
    sql: `SELECT "kind", COALESCE(SUM("amountCents"),0) AS cents FROM "ReceivableFact" WHERE "receivableId"=? GROUP BY "kind"`,
    args: [receivableId],
  });
  const by = Object.fromEntries(rows.map((r) => [String(r.kind), num(r.cents)])) as Partial<Record<FactKind, number>>;
  const paid = (by.payment ?? 0) - (by.refund ?? 0);
  const applied = by.deposit_application ?? 0;
  const reduced = (by.adjustment ?? 0) + (by.credit ?? 0);
  return { revision, totalCents, paidCents: paid, depositAppliedCents: applied, reducedCents: reduced, balanceCents: totalCents - reduced - applied - paid };
}

/** Facts the owner must resolve: late payments on old revisions, overpayments, negative balances. */
export async function receivableExceptions(db: ReceivableDb, businessId: string) {
  const { rows } = await db.execute({
    sql: `SELECT "id","receivableId","revision","amountCents","exception","checkoutSessionId","occurredAt" FROM "ReceivableFact" WHERE "businessId"=? AND "exception" IS NOT NULL ORDER BY "occurredAt"`,
    args: [businessId],
  });
  return rows.map((r) => ({ factId: String(r.id), receivableId: String(r.receivableId), revision: num(r.revision), amountCents: num(r.amountCents), exception: String(r.exception), sessionId: r.checkoutSessionId ? String(r.checkoutSessionId) : null }));
}

/* ---------- Backfill plan (pure; nothing is written) ---------- */

export type LegacyInvoice = { id: string; businessId: string; jobId: string | null; status: string; amountCents: number; subtotalCents: number | null; taxCents: number; taxBps: number; createdAt: string };
export type LegacyPayment = { id: string; invoiceId: string; amountCents: number; status: string; createdAt: string };
export type LegacyDeposit = { id: string; businessId: string; jobId: string | null; amountCents: number; status: string; paidAt: string | null };

const STATUS_RANK: Record<string, number> = { paid: 4, partial: 3, open: 2, draft: 1 };

/**
 * Which existing invoice becomes each job's canonical receivable, which become
 * extras, and which payments and deposits would become facts. Conflicts (two
 * invoices with money on one job, a deposit larger than its job's bill) are
 * listed for a person to decide, never resolved silently.
 */
export function planReceivableBackfill(input: { invoices: LegacyInvoice[]; payments: LegacyPayment[]; deposits: LegacyDeposit[] }) {
  const paidBy = new Map<string, number>();
  for (const p of input.payments) if (p.status === "recorded") paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amountCents);
  const byJob = new Map<string, LegacyInvoice[]>();
  const noJob: LegacyInvoice[] = [];
  for (const inv of input.invoices) {
    if (inv.status === "void" || inv.status === "canceled") continue;
    if (!inv.jobId) noJob.push(inv);
    else byJob.set(`${inv.businessId}:${inv.jobId}`, [...(byJob.get(`${inv.businessId}:${inv.jobId}`) ?? []), inv]);
  }
  const canonical: { invoiceId: string; businessId: string; jobId: string }[] = [];
  const extras: { invoiceId: string; reason: string }[] = [];
  const conflicts: { kind: string; businessId: string; jobId: string | null; detail: string }[] = [];
  for (const list of byJob.values()) {
    const sorted = [...list].sort((a, b) => (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0) || b.createdAt.localeCompare(a.createdAt));
    const [head, ...rest] = sorted;
    canonical.push({ invoiceId: head!.id, businessId: head!.businessId, jobId: head!.jobId! });
    for (const inv of rest) {
      extras.push({ invoiceId: inv.id, reason: "second invoice on the job" });
      if ((paidBy.get(inv.id) ?? 0) > 0) {
        conflicts.push({ kind: "money_on_two_invoices", businessId: inv.businessId, jobId: inv.jobId, detail: `${head!.id} and ${inv.id} both have payments` });
      }
    }
  }
  for (const inv of noJob) extras.push({ invoiceId: inv.id, reason: "no job" });
  const canonicalByJob = new Map(canonical.map((c) => [`${c.businessId}:${c.jobId}`, c.invoiceId]));
  const totals = new Map(input.invoices.map((i) => [i.id, i.amountCents]));
  const depositApplications: { depositId: string; invoiceId: string; amountCents: number; at: string | null; inferred: true }[] = [];
  for (const d of input.deposits) {
    if (d.status !== "paid" || !d.jobId) continue;
    const invoiceId = canonicalByJob.get(`${d.businessId}:${d.jobId}`);
    if (!invoiceId) continue;
    const total = totals.get(invoiceId) ?? 0;
    if (d.amountCents > total) conflicts.push({ kind: "deposit_exceeds_bill", businessId: d.businessId, jobId: d.jobId, detail: `${d.id} ${d.amountCents} > ${total}` });
    depositApplications.push({ depositId: d.id, invoiceId, amountCents: Math.min(d.amountCents, total), at: d.paidAt, inferred: true });
  }
  return {
    schemaVersion: RECEIVABLES_SCHEMA_VERSION,
    canonical,
    extras,
    paymentFacts: input.payments.filter((p) => p.status === "recorded").map((p) => ({ legacyPaymentId: p.id, invoiceId: p.invoiceId, amountCents: p.amountCents, at: p.createdAt })),
    depositApplications,
    conflicts,
  };
}
