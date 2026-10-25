import { createHash } from "node:crypto";

/**
 * The PartDraw section of prisma/turso-migrate.sql.
 * This is the only SQL the production step runs. Loaded by node without the
 * app alias, so this file imports nothing from @/.
 */
export const PART_DRAW_PLAN_FILE = "prisma/turso-migrate.sql#PartDraw";

export const PART_DRAW_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "PartDraw" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "priceBookItemId" TEXT NOT NULL,
    "drawn" INTEGER NOT NULL,
    CONSTRAINT "PartDraw_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartDraw_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartDraw_priceBookItemId_fkey" FOREIGN KEY ("priceBookItemId") REFERENCES "PriceBookItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PartDraw_jobId_priceBookItemId_key" ON "PartDraw"("jobId", "priceBookItemId")`,
  `CREATE INDEX IF NOT EXISTS "PartDraw_businessId_idx" ON "PartDraw"("businessId")`,
] as const;

export const PART_DRAW_COLUMNS = ["id", "businessId", "jobId", "priceBookItemId", "drawn"] as const;
export const PART_DRAW_INDEXES = ["PartDraw_jobId_priceBookItemId_key", "PartDraw_businessId_idx"] as const;

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

export function partDrawPlanSha256(statements: readonly string[] = PART_DRAW_STATEMENTS) {
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
 * Create PartDraw and record the release that did it. Idempotent.
 * A thrown statement leaves the ledger row at "started".
 */
export async function ensurePartDraw(
  db: SqlRunner,
  meta: { release: string; target: string; host: string; approval: string; backupRef: string; planSha256?: string },
) {
  const planSha256 = meta.planSha256 ?? partDrawPlanSha256();
  const present = names(await db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'PartDraw'`));
  const alreadyPresent = present.has("PartDraw");

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
    [meta.release, meta.target, meta.host, PART_DRAW_PLAN_FILE, planSha256, meta.approval, meta.backupRef, startedAt],
  );
  const started = await db.query<{ id: number | bigint }>(
    `SELECT "id" FROM "${LEDGER}" WHERE "backupRef" = ? AND "startedAt" = ? AND "status" = 'started' ORDER BY "id" DESC LIMIT 1`,
    [meta.backupRef, startedAt],
  );
  const rowId = Number(started[0]?.id);
  if (!rowId) throw new Error("the migration ledger did not record the start");

  try {
    for (const statement of PART_DRAW_STATEMENTS) {
      try {
        await db.execute(statement);
      } catch (error) {
        if (!skipped(error)) throw error;
      }
    }
    const columns = names(await db.query(`SELECT name FROM pragma_table_info('PartDraw')`));
    const missing = PART_DRAW_COLUMNS.filter((column) => !columns.has(column));
    if (missing.length) throw new Error(`PartDraw is missing ${missing.join(", ")}`);
    const indexes = names(await db.query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'PartDraw'`));
    const missingIndexes = PART_DRAW_INDEXES.filter((index) => !indexes.has(index));
    if (missingIndexes.length) throw new Error(`PartDraw is missing ${missingIndexes.join(", ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PartDraw was not created (${message}). Ledger row ${rowId} is still started.`);
  }

  const appliedAt = new Date().toISOString();
  await db.execute(`UPDATE "${LEDGER}" SET "status" = 'applied', "appliedAt" = ? WHERE "id" = ?`, [appliedAt, rowId]);
  return { tables: ["PartDraw"] as const, alreadyPresent, ledgerId: rowId, planSha256 };
}
