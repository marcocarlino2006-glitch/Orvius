#!/usr/bin/env node
/**
 * Apply incremental Turso migrations (ALTER TABLE / new tables).
 *
 * A separate, approved release step, never part of a build: see
 * `migrationAuthorization`. It must run before the release that needs the new
 * schema is promoted, or that release selects columns production lacks.
 * Rolling code back does not roll schema or payment data back.
 *
 * Every statement in the SQL file is idempotent, so a repeated run is a no-op.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/**
 * Only the injected environment. A remote migration never falls back to a
 * local .env file: the target has to be named on purpose for this run.
 */
function loadDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || null;
}

/**
 * Split the file into statements, ignoring semicolons that do not end one.
 *
 * This used to be `sql.split(";")`, which is a grenade with the pin out. A
 * prose semicolon inside a `--` comment — "on a shop's first ever load; two
 * fixture shops carry three" — cut a statement in half and sent the second
 * half, bare English, to the database as SQL. It came back `near "two":
 * syntax error`, which is not one of the tolerated messages below, so the
 * migration threw and the deploy failed.
 *
 * The reason that cost real time to find is the skip above: every local and
 * preview build points at file-backed SQLite and returns before reading this
 * file at all. So the SQL was unparsed everywhere except production, and the
 * only symptom was a red deploy with a green local build.
 *
 * Comments are therefore stripped before splitting, and a semicolon inside a
 * string literal is not treated as a terminator either.
 */
export function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inString = false;
  let inComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inComment) {
      if (char === "\n") {
        inComment = false;
        current += char;
      }
      continue;
    }

    if (inString) {
      current += char;
      if (char === "'") {
        // '' is an escaped quote inside a literal, not the end of one.
        if (next === "'") {
          current += next;
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (char === "-" && next === "-") {
      inComment = true;
      i += 1;
      continue;
    }
    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === ";") {
      // A trigger body holds its own statements; only the END closes the CREATE TRIGGER.
      if (/^\s*CREATE\s+TRIGGER\b/i.test(current) && !/\bEND\s*$/i.test(current)) {
        current += char;
        continue;
      }
      statements.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  statements.push(current);
  return statements.map((s) => s.trim()).filter(Boolean);
}

export const MIGRATION_FILE = "prisma/turso-migrate.sql";
/**
 * The only files this step may apply. The prepared receivables SQL carries
 * CREATE TRIGGER bodies; splitStatements keeps each trigger whole, which
 * scripts/turso-migrate.test.mjs proves against a disposable database.
 */
export const MIGRATION_PLAN_FILES = [MIGRATION_FILE, "prisma/prepared/receivables-v1.sql", "prisma/releases/2026-10-16-merge-all.sql"];
export const MIGRATION_LEDGER_TABLE = "_OrviusReleaseMigration";

export function migrationPlanFile(env = process.env) {
  const file = env.MIGRATION_PLAN_FILE?.trim() || MIGRATION_FILE;
  return MIGRATION_PLAN_FILES.includes(file) ? file : null;
}
export const MIGRATION_ALLOWLIST_FILE = "ops/migration-targets.json";

/** The checksum an approval binds to: the exact migration file this run would apply. */
export function migrationPlanSha256(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

/**
 * Whether this run may write to the database it points at. Fails closed, and
 * decides from the environment alone, before any connection is opened.
 *
 * Builds never migrate. A remote database is migrated only by a separate,
 * deliberate invocation that names: an approval reference, the exact release
 * commit (which must be the commit being run), the target ("production", or
 * an isolated "preview"/"staging" identity), a database host listed for that
 * target in ops/migration-targets.json, the SHA-256 of the migration file it
 * reviewed, and the backup or recovery point taken first. File-backed SQLite
 * is skipped: `prisma db push` owns local and test databases.
 */
export function migrationAuthorization(databaseUrl, env = process.env, context = {}) {
  if (!databaseUrl) return { action: "skip", reason: "no DATABASE_URL" };
  if (!/^(libsql|wss|https):/.test(databaseUrl)) return { action: "skip", reason: "DATABASE_URL is not a Turso URL" };
  let host;
  try {
    host = new URL(databaseUrl).host;
  } catch {
    return { action: "refuse", reason: "DATABASE_URL is not a valid URL" };
  }
  const refuse = (reason) => ({ action: "refuse", reason, host });
  if (env.CI_BUILD === "1" || env.VERCEL === "1" || env.NEXT_PHASE) {
    return refuse("migrations never run inside a build; run `npm run db:migrate:turso` as its own approved step");
  }
  const approval = env.MIGRATION_APPROVAL?.trim();
  if (!approval) return refuse("MIGRATION_APPROVAL (the approval reference) is not set");
  const release = env.MIGRATION_RELEASE_COMMIT?.trim().toLowerCase();
  if (!release || !/^[0-9a-f]{40}$/.test(release)) return refuse("MIGRATION_RELEASE_COMMIT must be the full 40-character release commit");
  if (!context.headCommit) return refuse("could not read the commit being run, so it cannot be matched to the release");
  if (context.headCommit !== release) return refuse(`this checkout is ${context.headCommit.slice(0, 12)}, not the approved release ${release.slice(0, 12)}`);
  const target = env.MIGRATION_TARGET?.trim();
  if (!["production", "preview", "staging"].includes(target ?? "")) return refuse("MIGRATION_TARGET must be production, preview or staging");
  const listed = context.allowlist?.[target] ?? [];
  if (!listed.includes(host)) return refuse(`${host} is not listed for ${target} in ${MIGRATION_ALLOWLIST_FILE}`);
  for (const [other, hosts] of Object.entries(context.allowlist ?? {})) {
    if (other !== target && hosts.includes(host)) return refuse(`${host} is also listed for ${other}; each environment needs its own database`);
  }
  const sha = env.MIGRATION_PLAN_SHA256?.trim().toLowerCase();
  if (!sha) return refuse("MIGRATION_PLAN_SHA256 (the reviewed migration file's checksum) is not set");
  if (sha !== context.planSha256) return refuse(`the migration file's checksum is ${context.planSha256}, not the reviewed ${sha}`);
  const backup = env.MIGRATION_BACKUP_REF?.trim();
  if (!backup) return refuse("MIGRATION_BACKUP_REF (the backup or recovery point taken first) is not set");
  return { action: "migrate", reason: `${target} ${host} at ${release.slice(0, 12)}, approval ${approval}, backup ${backup}`, host };
}

function headCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim().toLowerCase();
  } catch {
    return null;
  }
}

function readAllowlist() {
  const path = resolve(root, MIGRATION_ALLOWLIST_FILE);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Apply one reviewed plan and record which release, target, file and checksum
 * it was, with the approval and backup it ran under. The row is written as
 * "started" before the first statement and marked "applied" after the last, so
 * an interrupted run is visible as started-but-not-applied.
 */
export async function applyMigrationPlan(client, { sql, planFile, planSha256, release, target, host, approval, backupRef, now = () => new Date() }) {
  await client.execute(`CREATE TABLE IF NOT EXISTS "${MIGRATION_LEDGER_TABLE}" (
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
  const started = await client.execute({
    sql: `INSERT INTO "${MIGRATION_LEDGER_TABLE}" ("releaseCommit","target","host","planFile","planSha256","approval","backupRef","status","startedAt") VALUES (?,?,?,?,?,?,?,'started',?)`,
    args: [release, target, host, planFile, planSha256, approval, backupRef, now().toISOString()],
  });
  const rowId = Number(started.lastInsertRowid);
  for (const statement of splitStatements(sql)) {
    try {
      await client.execute(statement);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("duplicate column") || msg.includes("already exists")) continue;
      throw error;
    }
  }
  await client.execute({ sql: `UPDATE "${MIGRATION_LEDGER_TABLE}" SET "status"='applied',"appliedAt"=? WHERE "id"=?`, args: [now().toISOString(), rowId] });
  return rowId;
}

async function main() {
  const databaseUrl = loadDatabaseUrl();
  const planFile = migrationPlanFile();
  if (!planFile) throw new Error(`turso-migrate refused: MIGRATION_PLAN_FILE must be one of ${MIGRATION_PLAN_FILES.join(", ")}`);
  const sql = readFileSync(resolve(root, planFile), "utf8");
  const target = migrationAuthorization(databaseUrl, process.env, {
    headCommit: headCommit(),
    allowlist: readAllowlist(),
    planSha256: migrationPlanSha256(sql),
  });
  if (target.action === "refuse") {
    throw new Error(`turso-migrate refused: ${target.reason}`);
  }
  if (target.action === "skip") {
    console.log(`↷ turso-migrate: ${target.reason} — skipping`);
    return;
  }
  console.log(`→ turso-migrate: ${target.reason}`);

  const parsed = new URL(databaseUrl);
  const authToken = parsed.searchParams.get("authToken") ?? process.env.TURSO_AUTH_TOKEN?.trim();
  if (!authToken) throw new Error("Turso DATABASE_URL needs ?authToken=… or TURSO_AUTH_TOKEN");
  parsed.searchParams.delete("authToken");

  const client = createClient({ url: parsed.toString(), authToken });
  await applyMigrationPlan(client, {
    sql,
    planFile,
    planSha256: migrationPlanSha256(sql),
    release: process.env.MIGRATION_RELEASE_COMMIT.trim().toLowerCase(),
    target: process.env.MIGRATION_TARGET.trim(),
    host: target.host,
    approval: process.env.MIGRATION_APPROVAL.trim(),
    backupRef: process.env.MIGRATION_BACKUP_REF.trim(),
  });

  console.log(`✅ ${planFile} applied and recorded in ${MIGRATION_LEDGER_TABLE}`);
}

/*
  Only when run as a command. The statement splitter is imported by the test
  beside this file, and importing a module should never be what applies a
  migration to production.
*/
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
