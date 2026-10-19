#!/usr/bin/env node
/*
 * Canonical job receivables, prepared and not executed: the SQL in
 * prisma/prepared/receivables-v1.sql is applied only to a throwaway libsql
 * file created here (no credentials, no shared data). The database itself
 * holds one canonical bill per job, frozen issued revisions and append-only
 * money facts; the library keeps deposits as deposits and turns a late
 * payment on an old checkout into an exception for a person to resolve.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  applyDeposit,
  openCanonicalReceivable,
  openPlanCharge,
  planReceivableBackfill,
  receivableBalance,
  receivableExceptions,
  recordCheckoutAttempt,
  recordCheckoutPayment,
  recordCorrection,
  reviseReceivable,
} from "../src/lib/receivable-ledger.ts";

const sqlPath = new URL("../prisma/prepared/receivables-v1.sql", import.meta.url);
const migration = readFileSync(sqlPath, "utf8");
const dir = mkdtempSync(join(tmpdir(), "receivables-"));
const db = createClient({ url: `file:${join(dir, "disposable.db")}` });

test.before(async () => {
  await db.execute("PRAGMA foreign_keys = ON");
  await db.executeMultiple(`
    CREATE TABLE "Business" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "Job" ("id" TEXT PRIMARY KEY, "businessId" TEXT NOT NULL REFERENCES "Business"("id") ON DELETE CASCADE);
    INSERT INTO "Business" VALUES ('biz-1'), ('biz-2'), ('biz-gone');
    INSERT INTO "Job" VALUES ('job-1','biz-1'), ('job-2','biz-1'), ('job-3','biz-1'), ('job-4','biz-1'), ('job-5','biz-1'), ('job-1b','biz-2'), ('job-g','biz-gone');
  `);
  await db.executeMultiple(migration);
});
test.after(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const raw = (sql, args = []) => db.execute({ sql, args });

test("the prepared SQL is idempotent and its checksum is what the design note records", async () => {
  await db.executeMultiple(migration);
  const sha = createHash("sha256").update(migration).digest("hex");
  const note = readFileSync(new URL("../docs/GOVERNED-EXECUTION.md", import.meta.url), "utf8");
  assert.ok(note.includes(sha), `docs/GOVERNED-EXECUTION.md must record ${sha}`);
  assert.doesNotMatch(readFileSync(new URL("../prisma/turso-migrate.sql", import.meta.url), "utf8"), /JobReceivable/, "not in the release migration");
});

test("one canonical receivable per shop and job; any number with no job", async () => {
  const a = await openCanonicalReceivable(db, { businessId: "biz-1", jobId: "job-1", pricing: { subtotalCents: 20000, taxCents: 1000, taxBps: 500 } });
  const again = await openCanonicalReceivable(db, { businessId: "biz-1", jobId: "job-1", pricing: { subtotalCents: 1 } });
  assert.equal(a.created, true);
  assert.deepEqual(again, { receivableId: a.receivableId, created: false });
  await assert.rejects(raw(`INSERT INTO "JobReceivable" ("id","businessId","jobId","canonical") VALUES ('dup','biz-1','job-1',1)`), /UNIQUE/);
  await raw(`INSERT INTO "JobReceivable" ("id","businessId","jobId","canonical","kind") VALUES ('extra','biz-1','job-1',0,'job_extra')`);
  await openPlanCharge(db, { businessId: "biz-1", pricing: { subtotalCents: 3900 } });
  await openPlanCharge(db, { businessId: "biz-1", pricing: { subtotalCents: 3900 } });
  const other = await openCanonicalReceivable(db, { businessId: "biz-2", jobId: "job-1b", pricing: { subtotalCents: 500 } });
  assert.notEqual(other.receivableId, a.receivableId);
  await assert.rejects(raw(`INSERT INTO "JobReceivable" ("id","businessId","jobId","canonical") VALUES ('nojob','biz-1',NULL,1)`), /CHECK/);
  const { rows } = await raw(`SELECT COUNT(*) AS n FROM "JobReceivable" WHERE "jobId" IS NULL`);
  assert.equal(Number(rows[0].n), 2);
});

test("an issued revision can't be edited or deleted; before money it is superseded by the next one", async () => {
  const { receivableId } = await openCanonicalReceivable(db, { businessId: "biz-1", jobId: "job-2", pricing: { subtotalCents: 10000 } });
  await assert.rejects(raw(`UPDATE "ReceivableRevision" SET "totalCents"=1,"subtotalCents"=1 WHERE "receivableId"=?`, [receivableId]), /immutable/);
  await assert.rejects(raw(`DELETE FROM "ReceivableRevision" WHERE "receivableId"=?`, [receivableId]), /cannot be deleted/);
  assert.deepEqual(await reviseReceivable(db, { receivableId, pricing: { subtotalCents: 12000 } }), { revision: 2 });
  const { rows } = await raw(`SELECT "revision","status","supersededByRevision","totalCents" FROM "ReceivableRevision" WHERE "receivableId"=? ORDER BY "revision"`, [receivableId]);
  assert.deepEqual(rows.map((r) => [Number(r.revision), r.status, r.supersededByRevision == null ? null : Number(r.supersededByRevision), Number(r.totalCents)]), [
    [1, "superseded", 2, 10000],
    [2, "issued", null, 12000],
  ]);
  await assert.rejects(raw(`UPDATE "ReceivableRevision" SET "status"='issued' WHERE "receivableId"=? AND "revision"=1`, [receivableId]), /immutable/);
});

test("after a payment the receipt stands: no revision, only an adjustment or refund with a reason", async () => {
  const { receivableId } = await openCanonicalReceivable(db, { businessId: "biz-1", jobId: "job-3", pricing: { subtotalCents: 30000 } });
  await recordCheckoutAttempt(db, { receivableId, sessionId: "cs_job3", amountCents: 30000 });
  assert.deepEqual(await recordCheckoutPayment(db, { sessionId: "cs_job3", amountCents: 30000 }).then((r) => [r.duplicate, r.exception]), [false, null]);
  assert.equal((await recordCheckoutPayment(db, { sessionId: "cs_job3", amountCents: 30000 })).duplicate, true, "a replayed webhook records nothing new");
  await assert.rejects(reviseReceivable(db, { receivableId, pricing: { subtotalCents: 25000 } }), /adjustment or refund/);
  await assert.rejects(
    raw(`UPDATE "ReceivableRevision" SET "status"='superseded',"supersededAt"='x' WHERE "receivableId"=?`, [receivableId]),
    /money against it/,
    "the database refuses even if the library is bypassed",
  );
  await assert.rejects(recordCorrection(db, { receivableId, kind: "refund", amountCents: 5000, reason: " ", actor: "owner" }), /Say why/);
  await recordCorrection(db, { receivableId, kind: "refund", amountCents: 5000, reason: "one part not needed", actor: "owner" });
  await recordCorrection(db, { receivableId, kind: "adjustment", amountCents: 5000, reason: "one part not needed", actor: "owner" });
  assert.deepEqual(await receivableBalance(db, receivableId), { revision: 1, totalCents: 30000, paidCents: 25000, depositAppliedCents: 0, reducedCents: 5000, balanceCents: 0 });
  await assert.rejects(raw(`UPDATE "ReceivableFact" SET "amountCents"=1 WHERE "receivableId"=?`, [receivableId]), /append-only/);
  await assert.rejects(raw(`DELETE FROM "ReceivableFact" WHERE "receivableId"=?`, [receivableId]), /append-only/);
});

test("a deposit stays a deposit: dated applications, never more than was paid across bills", async () => {
  const deposit = { id: "dep-1", amountCents: 8000, status: "paid" };
  const one = await openCanonicalReceivable(db, { businessId: "biz-1", jobId: "job-4", pricing: { subtotalCents: 5000 } });
  const two = await openCanonicalReceivable(db, { businessId: "biz-1", jobId: "job-5", pricing: { subtotalCents: 9000 } });
  await assert.rejects(applyDeposit(db, { receivableId: one.receivableId, deposit: { ...deposit, status: "pending" }, amountCents: 1000, actor: "owner" }), /paid deposit/);
  await applyDeposit(db, { receivableId: one.receivableId, deposit, amountCents: 5000, actor: "owner", at: new Date("2026-10-01T12:00:00Z") });
  await assert.rejects(applyDeposit(db, { receivableId: two.receivableId, deposit, amountCents: 3001, actor: "owner" }), /more than is left/);
  await applyDeposit(db, { receivableId: two.receivableId, deposit, amountCents: 3000, actor: "owner" });
  assert.equal((await receivableBalance(db, one.receivableId)).balanceCents, 0);
  assert.equal((await receivableBalance(db, two.receivableId)).balanceCents, 6000);
  const { rows } = await raw(`SELECT "occurredAt" FROM "ReceivableFact" WHERE "depositId"='dep-1' ORDER BY "occurredAt"`);
  assert.equal(rows[0].occurredAt, "2026-10-01T12:00:00.000Z");
  await assert.rejects(raw(`INSERT INTO "ReceivableFact" ("id","businessId","receivableId","revision","kind","amountCents","occurredAt") VALUES ('x','biz-1',?,1,'deposit_application',1,'now')`, [one.receivableId]), /CHECK/);
});

test("a late payment on a superseded revision's checkout is recorded and surfaced as an exception", async () => {
  const { receivableId } = await openCanonicalReceivable(db, { businessId: "biz-2", jobId: "job-1b", pricing: { subtotalCents: 500 } });
  await recordCheckoutAttempt(db, { receivableId, sessionId: "cs_old", amountCents: 500 });
  await reviseReceivable(db, { receivableId, pricing: { subtotalCents: 800 } });
  await recordCheckoutAttempt(db, { receivableId, sessionId: "cs_new", amountCents: 800 });
  const late = await recordCheckoutPayment(db, { sessionId: "cs_old", amountCents: 500 });
  assert.equal(late.exception, "late_old_session");
  const paidNew = await recordCheckoutPayment(db, { sessionId: "cs_new", amountCents: 800 });
  assert.equal(paidNew.exception, "overpaid");
  assert.equal((await receivableBalance(db, receivableId)).balanceCents, -500);
  const exceptions = await receivableExceptions(db, "biz-2");
  assert.deepEqual(exceptions.map((e) => [e.exception, e.sessionId, e.revision]), [
    ["late_old_session", "cs_old", 1],
    ["overpaid", "cs_new", 2],
  ]);
});

test("deleting a shop still removes its receivables (account deletion is not blocked)", async () => {
  const { receivableId } = await openCanonicalReceivable(db, { businessId: "biz-gone", jobId: "job-g", pricing: { subtotalCents: 100 } });
  await recordCheckoutAttempt(db, { receivableId, sessionId: "cs_gone", amountCents: 100 });
  await recordCheckoutPayment(db, { sessionId: "cs_gone", amountCents: 100 });
  await raw(`DELETE FROM "Business" WHERE "id"='biz-gone'`);
  const { rows } = await raw(`SELECT COUNT(*) AS n FROM "ReceivableFact" WHERE "businessId"='biz-gone'`);
  assert.equal(Number(rows[0].n), 0);
});

test("the backfill plan picks one canonical invoice per job and lists conflicts instead of resolving them", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/receivables-backfill.json", import.meta.url), "utf8"));
  const plan = planReceivableBackfill(fixture);
  assert.deepEqual(plan.canonical.map((c) => c.invoiceId).sort(), ["inv-a1", "inv-b2", "inv-c1", "inv-e1"]);
  assert.deepEqual(plan.extras.map((e) => `${e.invoiceId}:${e.reason}`).sort(), ["inv-b1:second invoice on the job", "inv-c2:second invoice on the job", "inv-x1:no job"]);
  assert.deepEqual(plan.conflicts.map((c) => c.kind).sort(), ["deposit_exceeds_bill", "money_on_two_invoices"]);
  assert.deepEqual(plan.paymentFacts.map((p) => p.legacyPaymentId).sort(), ["pay-a1", "pay-b2", "pay-c1", "pay-c2"]);
  assert.deepEqual(plan.depositApplications.map((d) => [d.depositId, d.invoiceId, d.amountCents, d.inferred]), [
    ["dep-a", "inv-a1", 5000, true],
    ["dep-e", "inv-e1", 6000, true],
  ]);
});
