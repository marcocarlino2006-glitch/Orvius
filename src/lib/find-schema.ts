import { createHash } from "node:crypto";
import { approvalOk, backupRefOk, type SqlRunner } from "@/lib/job-billing-schema";

/**
 * The VisitReview and AreaRequest section of prisma/turso-migrate.sql.
 * This is the only SQL the production step runs. The request names the
 * backup and the checksum; it never supplies a statement.
 */
export const FIND_PLAN_FILE = "prisma/turso-migrate.sql#Find";

export const FIND_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "VisitReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitReview_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VisitReview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "VisitReview_jobId_key" ON "VisitReview"("jobId")`,
  `CREATE INDEX IF NOT EXISTS "VisitReview_businessId_createdAt_idx" ON "VisitReview"("businessId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "AreaRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trade" TEXT NOT NULL,
    "zip3" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "need" TEXT NOT NULL,
    "claimedById" TEXT,
    "leadId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" DATETIME,
    CONSTRAINT "AreaRequest_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "AreaRequest_leadId_key" ON "AreaRequest"("leadId")`,
  `CREATE INDEX IF NOT EXISTS "AreaRequest_trade_zip3_claimedAt_idx" ON "AreaRequest"("trade", "zip3", "claimedAt")`,
] as const;

export const FIND_COLUMNS = {
  VisitReview: ["id", "businessId", "jobId", "rating", "body", "createdAt"],
  AreaRequest: ["id", "trade", "zip3", "name", "phone", "need", "claimedById", "leadId", "createdAt", "claimedAt"],
} as const;

export const FIND_INDEXES = {
  VisitReview: ["VisitReview_jobId_key", "VisitReview_businessId_createdAt_idx"],
  AreaRequest: ["AreaRequest_leadId_key", "AreaRequest_trade_zip3_claimedAt_idx"],
} as const;

const LEDGER = "_OrviusReleaseMigration";

export { approvalOk, backupRefOk };
export type { SqlRunner };

export function findPlanSha256(statements: readonly string[] = FIND_STATEMENTS) {
  return createHash("sha256").update(statements.join("\n")).digest("hex");
}

export function relationMissing(error: unknown, table: string) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(table) && /no such table|does not exist/i.test(message);
}

function names(rows: Record<string, unknown>[]) {
  return new Set(rows.map((row) => String(row.name ?? row.NAME ?? "")));
}

function skipped(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists|duplicate column/i.test(message);
}

/**
 * Create VisitReview and AreaRequest and record the release that did it.
 * Idempotent. A thrown statement leaves the ledger row at "started".
 */
export async function ensureFindTables(
  db: SqlRunner,
  meta: { release: string; target: string; host: string; approval: string; backupRef: string; planSha256?: string },
) {
  const planSha256 = meta.planSha256 ?? findPlanSha256();
  const present = names(
    await db.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('VisitReview', 'AreaRequest')`,
    ),
  );
  const alreadyPresent = present.has("VisitReview") && present.has("AreaRequest");

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
    [meta.release, meta.target, meta.host, FIND_PLAN_FILE, planSha256, meta.approval, meta.backupRef, startedAt],
  );
  const started = await db.query<{ id: number | bigint }>(
    `SELECT "id" FROM "${LEDGER}" WHERE "backupRef" = ? AND "startedAt" = ? AND "status" = 'started' ORDER BY "id" DESC LIMIT 1`,
    [meta.backupRef, startedAt],
  );
  const rowId = Number(started[0]?.id);
  if (!rowId) throw new Error("the migration ledger did not record the start");

  try {
    for (const statement of FIND_STATEMENTS) {
      try {
        await db.execute(statement);
      } catch (error) {
        if (!skipped(error)) throw error;
      }
    }
    for (const table of ["VisitReview", "AreaRequest"] as const) {
      const columns = names(await db.query(`SELECT name FROM pragma_table_info('${table}')`));
      const missing = FIND_COLUMNS[table].filter((column) => !columns.has(column));
      if (missing.length) throw new Error(`${table} is missing ${missing.join(", ")}`);
      const indexes = names(await db.query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '${table}'`));
      const missingIndexes = FIND_INDEXES[table].filter((index) => !indexes.has(index));
      if (missingIndexes.length) throw new Error(`${table} is missing ${missingIndexes.join(", ")}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Find tables were not created (${message}). Ledger row ${rowId} is still started.`);
  }

  const appliedAt = new Date().toISOString();
  await db.execute(`UPDATE "${LEDGER}" SET "status" = 'applied', "appliedAt" = ? WHERE "id" = ?`, [appliedAt, rowId]);
  return { tables: ["VisitReview", "AreaRequest"] as const, alreadyPresent, ledgerId: rowId, planSha256 };
}
