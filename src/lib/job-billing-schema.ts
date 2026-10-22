import { createHash } from "node:crypto";

/**
 * The JobBilling section of prisma/turso-migrate.sql. This is the only SQL
 * the production step runs. The request names the backup and the checksum; it
 * never supplies a statement.
 */
export const JOB_BILLING_PLAN_FILE = "prisma/turso-migrate.sql#JobBilling";

export const JOB_BILLING_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "JobBilling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'required',
    "amountCents" INTEGER NOT NULL,
    "invoiceId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "attemptedAt" DATETIME,
    "claimedAt" DATETIME,
    "claimToken" TEXT,
    "notifyStatus" TEXT,
    "notifyError" TEXT,
    "notifyAttemptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobBilling_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobBilling_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "JobBilling_jobId_key" ON "JobBilling"("jobId")`,
  `CREATE INDEX IF NOT EXISTS "JobBilling_businessId_status_idx" ON "JobBilling"("businessId", "status")`,
  `CREATE INDEX IF NOT EXISTS "JobBilling_status_attemptedAt_idx" ON "JobBilling"("status", "attemptedAt")`,
] as const;

export const JOB_BILLING_COLUMNS = [
  "id",
  "businessId",
  "jobId",
  "status",
  "amountCents",
  "invoiceId",
  "attempts",
  "lastError",
  "attemptedAt",
  "claimedAt",
  "claimToken",
  "notifyStatus",
  "notifyError",
  "notifyAttemptedAt",
  "createdAt",
  "updatedAt",
] as const;

export const JOB_BILLING_INDEXES = [
  "JobBilling_jobId_key",
  "JobBilling_businessId_status_idx",
  "JobBilling_status_attemptedAt_idx",
] as const;

const LEDGER = "_OrviusReleaseMigration";

export function jobBillingPlanSha256(statements: readonly string[] = JOB_BILLING_STATEMENTS) {
  return createHash("sha256").update(statements.join("\n")).digest("hex");
}

export function approvalOk(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return /^[\w .:,'#-]{8,180}$/.test(text);
}

export function backupRefOk(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,180}$/.test(text);
}

export type SqlRunner = {
  execute(sql: string, args?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, args?: unknown[]): Promise<T[]>;
};

function names(rows: Record<string, unknown>[]) {
  return new Set(rows.map((row) => String(row.name ?? row.NAME ?? "")));
}

function skipped(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|duplicate column/i.test(message);
}

/**
 * Create JobBilling and record the release that did it. Idempotent: a second
 * run keeps the table and writes another applied ledger row. A thrown
 * statement leaves the ledger row at "started".
 */
export async function ensureJobBillingTable(
  db: SqlRunner,
  meta: { release: string; target: string; host: string; approval: string; backupRef: string; planSha256?: string },
) {
  const planSha256 = meta.planSha256 ?? jobBillingPlanSha256();
  const present = names(await db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'JobBilling'`));
  const alreadyPresent = present.has("JobBilling");

  await db.execute(`CREATE TABLE IF NOT EXISTS "${LEDGER}" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "releaseCommit" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "planFile" TEXT NOT NULL,
    "planSha256" TEXT NOT NULL,
    "approval" TEXT NOT NULL,
    "backupRef" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TEXT NOT NULL,
    "appliedAt" TEXT
  )`);

  const startedAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO "${LEDGER}" ("releaseCommit","target","host","planFile","planSha256","approval","backupRef","status","startedAt") VALUES (?,?,?,?,?,?,?,'started',?)`,
    [meta.release, meta.target, meta.host, JOB_BILLING_PLAN_FILE, planSha256, meta.approval, meta.backupRef, startedAt],
  );
  const started = await db.query<{ id: number | bigint }>(
    `SELECT "id" FROM "${LEDGER}" WHERE "backupRef" = ? AND "startedAt" = ? AND "status" = 'started' ORDER BY "id" DESC LIMIT 1`,
    [meta.backupRef, startedAt],
  );
  const rowId = Number(started[0]?.id);
  if (!rowId) throw new Error("the migration ledger did not record the start");

  try {
    for (const statement of JOB_BILLING_STATEMENTS) {
      try {
        await db.execute(statement);
      } catch (error) {
        if (!skipped(error)) throw error;
      }
    }
    const columns = names(await db.query(`SELECT name FROM pragma_table_info('JobBilling')`));
    const missing = JOB_BILLING_COLUMNS.filter((column) => !columns.has(column));
    if (missing.length) throw new Error(`JobBilling is missing ${missing.join(", ")}`);
    const indexes = names(await db.query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'JobBilling'`));
    const missingIndexes = JOB_BILLING_INDEXES.filter((index) => !indexes.has(index));
    if (missingIndexes.length) throw new Error(`JobBilling is missing ${missingIndexes.join(", ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JobBilling was not created (${message}). Ledger row ${rowId} is still started.`);
  }

  const appliedAt = new Date().toISOString();
  await db.execute(`UPDATE "${LEDGER}" SET "status" = 'applied', "appliedAt" = ? WHERE "id" = ?`, [appliedAt, rowId]);
  return { table: "JobBilling" as const, alreadyPresent, ledgerId: rowId, planSha256 };
}
