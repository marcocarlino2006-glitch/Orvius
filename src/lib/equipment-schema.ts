import { createHash } from "node:crypto";

/**
 * The Lead equipment columns in prisma/turso-migrate.sql.
 * This is the only SQL the production step runs. Loaded by node without the
 * app alias, so this file imports nothing from @/.
 *
 * Command, Calls, and Inbox read Lead through Prisma, which selects every
 * column on the model. These three were added to the schema without a
 * production apply, so each of those screens failed together.
 */
export const EQUIPMENT_PLAN_FILE = "prisma/turso-migrate.sql#LeadEquipment";

export const EQUIPMENT_STATEMENTS = [
  `ALTER TABLE "Lead" ADD COLUMN "systemType" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN "equipmentBrand" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN "equipmentModel" TEXT`,
] as const;

export const EQUIPMENT_COLUMNS = ["systemType", "equipmentBrand", "equipmentModel"] as const;

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

export function equipmentPlanSha256(statements: readonly string[] = EQUIPMENT_STATEMENTS) {
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
 * Add the three Lead equipment columns and record the release that did it.
 * Idempotent. A thrown statement leaves the ledger row at "started".
 */
export async function ensureEquipmentColumns(
  db: SqlRunner,
  meta: { release: string; target: string; host: string; approval: string; backupRef: string; planSha256?: string },
) {
  const planSha256 = meta.planSha256 ?? equipmentPlanSha256();
  const before = names(await db.query(`SELECT name FROM pragma_table_info('Lead')`));
  const alreadyPresent = EQUIPMENT_COLUMNS.every((column) => before.has(column));

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
    [meta.release, meta.target, meta.host, EQUIPMENT_PLAN_FILE, planSha256, meta.approval, meta.backupRef, startedAt],
  );
  const started = await db.query<{ id: number | bigint }>(
    `SELECT "id" FROM "${LEDGER}" WHERE "backupRef" = ? AND "startedAt" = ? AND "status" = 'started' ORDER BY "id" DESC LIMIT 1`,
    [meta.backupRef, startedAt],
  );
  const rowId = Number(started[0]?.id);
  if (!rowId) throw new Error("the migration ledger did not record the start");

  try {
    for (const statement of EQUIPMENT_STATEMENTS) {
      try {
        await db.execute(statement);
      } catch (error) {
        if (!skipped(error)) throw error;
      }
    }
    const columns = names(await db.query(`SELECT name FROM pragma_table_info('Lead')`));
    const missing = EQUIPMENT_COLUMNS.filter((column) => !columns.has(column));
    if (missing.length) throw new Error(`Lead is missing ${missing.join(", ")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Lead equipment columns were not added (${message}). Ledger row ${rowId} is still started.`);
  }

  const appliedAt = new Date().toISOString();
  await db.execute(`UPDATE "${LEDGER}" SET "status" = 'applied', "appliedAt" = ? WHERE "id" = ?`, [appliedAt, rowId]);
  return { columns: EQUIPMENT_COLUMNS, alreadyPresent, ledgerId: rowId, planSha256 };
}
