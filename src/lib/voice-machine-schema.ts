import { createHash } from "node:crypto";

/**
 * Business.voiceMachineId. This is the only SQL the production step runs.
 * Loaded by node without the app alias, so this file imports nothing from @/.
 * It stays out of prisma/turso-migrate.sql: that file must match
 * schema.prisma, and Prisma does not select this column (voice-machine.ts
 * reads it with raw SQL).
 *
 * Every live shop already answers on /api/webhooks/vapi/machines/<its own id>,
 * sealed with that id. The backfill stores exactly that id, so adding the
 * column changes no shop's URL or seal: no assistant needs re-pointing, and no
 * call can land between an old door closing and a new one opening.
 */
export const VOICE_MACHINE_PLAN_FILE = "src/lib/voice-machine-schema.ts#VOICE_MACHINE_STATEMENTS";

export const VOICE_MACHINE_STATEMENTS = [
  `ALTER TABLE "Business" ADD COLUMN "voiceMachineId" TEXT`,
  `UPDATE "Business" SET "voiceMachineId" = "id" WHERE "voiceMachineId" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Business_voiceMachineId_key" ON "Business"("voiceMachineId")`,
] as const;

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

export function voiceMachinePlanSha256(statements: readonly string[] = VOICE_MACHINE_STATEMENTS) {
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
 * Add Business.voiceMachineId, backfill it, index it, and record the release
 * that did it. Idempotent. A thrown statement leaves the ledger row at "started".
 */
export async function ensureVoiceMachineColumn(
  db: SqlRunner,
  meta: { release: string; target: string; host: string; approval: string; backupRef: string; planSha256?: string },
) {
  const planSha256 = meta.planSha256 ?? voiceMachinePlanSha256();
  const before = names(await db.query(`SELECT name FROM pragma_table_info('Business')`));
  const alreadyPresent = before.has("voiceMachineId");

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
    [meta.release, meta.target, meta.host, VOICE_MACHINE_PLAN_FILE, planSha256, meta.approval, meta.backupRef, startedAt],
  );
  const started = await db.query<{ id: number | bigint }>(
    `SELECT "id" FROM "${LEDGER}" WHERE "backupRef" = ? AND "startedAt" = ? AND "status" = 'started' ORDER BY "id" DESC LIMIT 1`,
    [meta.backupRef, startedAt],
  );
  const rowId = Number(started[0]?.id);
  if (!rowId) throw new Error("the migration ledger did not record the start");

  let unset = 0;
  try {
    for (const statement of VOICE_MACHINE_STATEMENTS) {
      try {
        await db.execute(statement);
      } catch (error) {
        if (!skipped(error)) throw error;
      }
    }
    const columns = names(await db.query(`SELECT name FROM pragma_table_info('Business')`));
    if (!columns.has("voiceMachineId")) throw new Error("Business is missing voiceMachineId");
    const rows = await db.query<{ n: number | bigint }>(`SELECT COUNT(*) AS n FROM "Business" WHERE "voiceMachineId" IS NULL`);
    unset = Number(rows[0]?.n ?? 0);
    if (unset) throw new Error(`${unset} shops have no voiceMachineId after the backfill`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Business.voiceMachineId was not added (${message}). Ledger row ${rowId} is still started.`);
  }

  const appliedAt = new Date().toISOString();
  await db.execute(`UPDATE "${LEDGER}" SET "status" = 'applied', "appliedAt" = ? WHERE "id" = ?`, [appliedAt, rowId]);
  return { columns: ["voiceMachineId"], alreadyPresent, ledgerId: rowId, planSha256 };
}
