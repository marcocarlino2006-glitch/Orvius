import { createHash } from "node:crypto";

/**
 * The CallReview section of prisma/turso-migrate.sql: the post-call judge's
 * verdict on each answered call, graded against the shop's trade. Its own
 * table, not a Call column, so no existing Call query can trip on it before
 * the table exists. Removed with its call.
 * This is the only SQL the production step runs. Loaded by node without the
 * app alias, so this file imports nothing from @/.
 */
export const CALL_REVIEW_PLAN_FILE = "prisma/turso-migrate.sql#CallReview";

export const CALL_REVIEW_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "CallReview" (
    "callId" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "verdictJson" TEXT NOT NULL,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallReview_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE INDEX IF NOT EXISTS "CallReview_businessId_createdAt_idx" ON "CallReview"("businessId", "createdAt")`,
] as const;

export const CALL_REVIEW_COLUMNS = ["callId", "businessId", "verdictJson", "failed", "createdAt"] as const;
export const CALL_REVIEW_INDEXES = ["CallReview_businessId_createdAt_idx"] as const;

const LEDGER = "_OrviusReleaseMigration";

export type SqlRunner = {
  execute(sql: string, args?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, args?: unknown[]): Promise<T[]>;
};

export function approvalOk(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return /^[\w .:,'#-]{8,180}$/.test(text);
}

export function backupRefOk(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,180}$/.test(text);
}

export function callReviewPlanSha256(statements: readonly string[] = CALL_REVIEW_STATEMENTS) {
  return createHash("sha256").update(statements.join("\n")).digest("hex");
}

function names(rows: Record<string, unknown>[]) {
  return new Set(rows.map((row) => String(row.name ?? row.NAME ?? "")));
}

function skipped(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|duplicate column/i.test(message);
}

/**
 * Create CallReview and record the release that did it. Idempotent.
 * A thrown statement leaves the ledger row at "started".
 */
export async function ensureCallReview(
  db: SqlRunner,
  meta: { release: string; target: string; host: string; approval: string; backupRef: string; planSha256?: string },
) {
  const planSha256 = meta.planSha256 ?? callReviewPlanSha256();
  const present = names(await db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'CallReview'`));
  const alreadyPresent = present.has("CallReview");

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
    [meta.release, meta.target, meta.host, CALL_REVIEW_PLAN_FILE, planSha256, meta.approval, meta.backupRef, startedAt],
  );
  const started = await db.query<{ id: number | bigint }>(
    `SELECT "id" FROM "${LEDGER}" WHERE "backupRef" = ? AND "startedAt" = ? AND "status" = 'started' ORDER BY "id" DESC LIMIT 1`,
    [meta.backupRef, startedAt],
  );
  const rowId = Number(started[0]?.id);
  if (!rowId) throw new Error("the migration ledger did not record the start");

  try {
    for (const statement of CALL_REVIEW_STATEMENTS) {
      try {
        await db.execute(statement);
      } catch (error) {
        if (!skipped(error)) throw error;
      }
    }
    const columns = names(await db.query(`SELECT name FROM pragma_table_info('CallReview')`));
    const missing = CALL_REVIEW_COLUMNS.filter((column) => !columns.has(column));
    if (missing.length) throw new Error(`CallReview is missing ${missing.join(", ")}`);
    const indexes = names(await db.query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'CallReview'`));
    const missingIndexes = CALL_REVIEW_INDEXES.filter((index) => !indexes.has(index));
    if (missingIndexes.length) throw new Error(`CallReview is missing ${missingIndexes.join(", ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`CallReview was not created (${message}). Ledger row ${rowId} is still started.`);
  }

  const appliedAt = new Date().toISOString();
  await db.execute(`UPDATE "${LEDGER}" SET "status" = 'applied', "appliedAt" = ? WHERE "id" = ?`, [appliedAt, rowId]);
  return { tables: ["CallReview"] as const, alreadyPresent, ledgerId: rowId, planSha256 };
}
