import { createHash } from "node:crypto";

/**
 * The Growth section of prisma/turso-migrate.sql: FunnelEvent counts each step
 * from the pricing page to a paid shop without cookies, and LifecycleEmail is
 * the ledger that lets a sweep send each setup-recovery, welcome and first-call
 * email once. New tables, not Business columns, so no existing query can trip
 * on them before they exist. Lifecycle rows go with their shop.
 * This is the only SQL the production step runs. Loaded by node without the
 * app alias, so this file imports nothing from @/.
 */
export const GROWTH_PLAN_FILE = "prisma/turso-migrate.sql#Growth";

export const GROWTH_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "FunnelEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "event" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE INDEX IF NOT EXISTS "FunnelEvent_createdAt_event_idx" ON "FunnelEvent"("createdAt", "event")`,
  `CREATE TABLE IF NOT EXISTS "LifecycleEmail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LifecycleEmail_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleEmail_dedupeKey_key" ON "LifecycleEmail"("dedupeKey")`,
  `CREATE INDEX IF NOT EXISTS "LifecycleEmail_businessId_kind_idx" ON "LifecycleEmail"("businessId", "kind")`,
] as const;

export const GROWTH_TABLES = {
  FunnelEvent: {
    columns: ["id", "event", "who", "detail", "createdAt"],
    indexes: ["FunnelEvent_createdAt_event_idx"],
  },
  LifecycleEmail: {
    columns: ["id", "businessId", "kind", "dedupeKey", "toEmail", "status", "providerId", "createdAt"],
    indexes: ["LifecycleEmail_dedupeKey_key", "LifecycleEmail_businessId_kind_idx"],
  },
} as const;

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

export function growthPlanSha256(statements: readonly string[] = GROWTH_STATEMENTS) {
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
 * Create FunnelEvent and LifecycleEmail and record the release that did it.
 * Idempotent. A thrown statement leaves the ledger row at "started".
 */
export async function ensureGrowthTables(
  db: SqlRunner,
  meta: { release: string; target: string; host: string; approval: string; backupRef: string; planSha256?: string },
) {
  const planSha256 = meta.planSha256 ?? growthPlanSha256();
  const tables = Object.keys(GROWTH_TABLES) as Array<keyof typeof GROWTH_TABLES>;
  const present = names(
    await db.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('FunnelEvent', 'LifecycleEmail')`),
  );
  const alreadyPresent = tables.every((table) => present.has(table));

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
    [meta.release, meta.target, meta.host, GROWTH_PLAN_FILE, planSha256, meta.approval, meta.backupRef, startedAt],
  );
  const started = await db.query<{ id: number | bigint }>(
    `SELECT "id" FROM "${LEDGER}" WHERE "backupRef" = ? AND "startedAt" = ? AND "status" = 'started' ORDER BY "id" DESC LIMIT 1`,
    [meta.backupRef, startedAt],
  );
  const rowId = Number(started[0]?.id);
  if (!rowId) throw new Error("the migration ledger did not record the start");

  try {
    for (const statement of GROWTH_STATEMENTS) {
      try {
        await db.execute(statement);
      } catch (error) {
        if (!skipped(error)) throw error;
      }
    }
    for (const table of tables) {
      const columns = names(await db.query(`SELECT name FROM pragma_table_info('${table}')`));
      const missing = GROWTH_TABLES[table].columns.filter((column) => !columns.has(column));
      if (missing.length) throw new Error(`${table} is missing ${missing.join(", ")}`);
      const indexes = names(await db.query(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '${table}'`));
      const missingIndexes = GROWTH_TABLES[table].indexes.filter((index) => !indexes.has(index));
      if (missingIndexes.length) throw new Error(`${table} is missing ${missingIndexes.join(", ")}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`The growth tables were not created (${message}). Ledger row ${rowId} is still started.`);
  }

  const appliedAt = new Date().toISOString();
  await db.execute(`UPDATE "${LEDGER}" SET "status" = 'applied', "appliedAt" = ? WHERE "id" = ?`, [appliedAt, rowId]);
  return { tables, alreadyPresent, ledgerId: rowId, planSha256 };
}
