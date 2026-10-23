#!/usr/bin/env node
/**
 * Add Business.voiceMachineId on the named Turso database.
 *
 * Runs only as its own step, after a backup. Refuses unless the checkout,
 * the approval, the target host, the backup reference and this file's
 * checksum all match. These two statements are the whole plan. They stay
 * out of prisma/turso-migrate.sql because the Prisma client does not select
 * the column until a later schema change, and that file must match the schema.
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { applyMigrationPlan, migrationAuthorization, migrationPlanSha256 } from "./turso-migrate.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const VOICE_MACHINE_SQL = `ALTER TABLE "Business" ADD COLUMN "voiceMachineId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Business_voiceMachineId_key" ON "Business"("voiceMachineId");`;

/** Reviewed checksum of VOICE_MACHINE_SQL. A changed statement has to be reviewed again. */
export const VOICE_MACHINE_PLAN_SHA256 = "c3fee754a61167982fb5c6263ac819dccdb24cab2803088cb2cafdc8329f00d7";

export function voiceMachinePlanSha256() {
  return migrationPlanSha256(VOICE_MACHINE_SQL);
}

function headCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim().toLowerCase();
  } catch {
    return null;
  }
}

async function main() {
  if (voiceMachinePlanSha256() !== VOICE_MACHINE_PLAN_SHA256) {
    throw new Error("voiceMachineId statements no longer match the reviewed checksum");
  }
  const databaseUrl = process.env.DATABASE_URL?.trim() || null;
  const decision = migrationAuthorization(databaseUrl, process.env, {
    headCommit: headCommit(),
    allowlist: JSON.parse(readFileSync(resolve(root, "ops/migration-targets.json"), "utf8")),
    planSha256: voiceMachinePlanSha256(),
  });
  if (decision.action !== "migrate") {
    throw new Error(`voiceMachineId migration ${decision.action}: ${decision.reason}`);
  }
  const parsed = new URL(databaseUrl);
  const authToken = parsed.searchParams.get("authToken") ?? process.env.TURSO_AUTH_TOKEN?.trim();
  if (!authToken) throw new Error("Turso DATABASE_URL needs ?authToken=… or TURSO_AUTH_TOKEN");
  parsed.searchParams.delete("authToken");
  const client = createClient({ url: parsed.toString(), authToken });
  await applyMigrationPlan(client, {
    sql: VOICE_MACHINE_SQL,
    planFile: "prisma/turso-migrate.sql#voiceMachineId",
    planSha256: voiceMachinePlanSha256(),
    release: process.env.MIGRATION_RELEASE_COMMIT.trim().toLowerCase(),
    target: process.env.MIGRATION_TARGET.trim(),
    host: decision.host,
    approval: process.env.MIGRATION_APPROVAL.trim(),
    backupRef: process.env.MIGRATION_BACKUP_REF.trim(),
  });
  const probe = await client.execute('SELECT "voiceMachineId" FROM "Business" LIMIT 1');
  console.log(`voiceMachineId column is present (${probe.columns.join(", ")})`);
  client.close();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
