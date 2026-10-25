import { createHash } from "node:crypto";

/**
 * The PartStock section of prisma/turso-migrate.sql.
 * This is the only SQL the production step runs. Loaded by node without the
 * app alias, so this file imports nothing from @/.
 */
export const PART_STOCK_PLAN_FILE = "prisma/turso-migrate.sql#PartStock";

export const PART_STOCK_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "PartStock" (
    "priceBookItemId" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "onTruck" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartStock_priceBookItemId_fkey" FOREIGN KEY ("priceBookItemId") REFERENCES "PriceBookItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartStock_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE INDEX IF NOT EXISTS "PartStock_businessId_idx" ON "PartStock"("businessId")`,
] as const;

export const PART_STOCK_COLUMNS = ["priceBookItemId", "businessId", "onTruck", "updatedAt"] as const;
export const PART_STOCK_INDEXES = ["PartStock_businessId_idx"] as const;

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

export function partStockPlanSha256(statements: readonly string[] = PART_STOCK_STATEMENTS) {
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
 * Create PartStock and record the release that did it. Idempotent.
 * A thrown statement leaves the ledger row at "started".
 */
export async function ensurePartStock(
  db: SqlRunner,
  meta: { release: string; target: string; host: string; approval: string; backupRef: string; planSha256?: string },
) {
  const planSha256 = meta.planSha256 ?? partStockPlanSha256();
  const present = names(await db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'PartStock'`));
  const alreadyPresent = present.has("PartStock");

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
    [meta.release, meta.target, meta.host, PART_STOCK_PLAN_FILE, planSha256, meta.approval, meta.backupRef, startedAt],
  );
  const started = await db.query<{ id: number | bigint }>(
    `SELECT "id" FROM "${LEDGER}" WHERE "backupRef" = ? AND "startedAt" = ? AND "status" = 'started' ORDER BY "id" DESC LIMIT 1`,
    [meta.backupRef, startedAt],
  );
  const rowId = Number(started[0]?.id);
  if (!rowId) throw new Error("the migration ledger did not record the start");

  try {
    for (const statement of PART_STOCK_STATEMENTS) {
      try {
        await db.execute(statement);
      } catch (error) {
        if (!skipped(error)) throw error;
      }
    }
    const columns = names(await db.query(`SELECT name FROM pragma_table_info('PartStock')`));
    const missing = PART_STOCK_COLUMNS.filter((column) => !columns.has(column));
    if (missing.length) throw new Error(`PartStock is missing ${missing.join(", ")}`);
    const indexes = names(await db.query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'PartStock'`));
    const missingIndexes = PART_STOCK_INDEXES.filter((index) => !indexes.has(index));
    if (missingIndexes.length) throw new Error(`PartStock is missing ${missingIndexes.join(", ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PartStock was not created (${message}). Ledger row ${rowId} is still started.`);
  }

  const appliedAt = new Date().toISOString();
  await db.execute(`UPDATE "${LEDGER}" SET "status" = 'applied', "appliedAt" = ? WHERE "id" = ?`, [appliedAt, rowId]);
  return { tables: ["PartStock"] as const, alreadyPresent, ledgerId: rowId, planSha256 };
}
