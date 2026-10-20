/**
 * The migration SQL only ever executes in production.
 *
 * turso-migrate skips any DATABASE_URL that is not a remote libsql URL, and
 * local and preview builds are all file-backed SQLite, so nothing on the way
 * to production ever parses prisma/turso-migrate.sql. A broken statement in
 * there is invisible until the deploy that needed it fails — which is how a
 * prose semicolon in a `--` comment ("first ever load; two fixture shops")
 * split a statement in half and sent bare English to the database as SQL.
 *
 * These tests parse the real file the way the build does, so that class of
 * mistake fails here instead of on a deploy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { migrationAuthorization, migrationPlanSha256, splitStatements } from "./turso-migrate.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationSql = readFileSync(join(repoRoot, "prisma/turso-migrate.sql"), "utf8");

/* The verbs this migration is allowed to use. */
const SQL_VERB = /^(ALTER|CREATE|UPDATE|DELETE|INSERT|DROP|PRAGMA)\b/i;

test("every statement in the real migration file starts with a SQL verb", () => {
  const offenders = splitStatements(migrationSql).filter((statement) => !SQL_VERB.test(statement));
  assert.deepEqual(
    offenders,
    [],
    `not SQL:\n${offenders.map((s) => s.slice(0, 120)).join("\n---\n")}`,
  );
});

test("a semicolon inside a comment does not split the statement after it", () => {
  const sql = [
    "-- it fired; then it stopped",
    'ALTER TABLE "Job" ADD COLUMN "note" TEXT;',
  ].join("\n");

  assert.deepEqual(splitStatements(sql), ['ALTER TABLE "Job" ADD COLUMN "note" TEXT']);

  /*
    The bug this replaced, stated as the contrast: splitting on every
    semicolon leaves a fragment that begins mid-sentence, and that fragment is
    what got sent to the database.
  */
  const naive = sql.split(";").map((s) => s.trim()).filter(Boolean);
  assert.ok(
    naive.some((fragment) => fragment.startsWith("then it stopped")),
    "expected naive splitting to strand prose as a statement",
  );
});

test("a semicolon inside a string literal does not end the statement", () => {
  const sql = `UPDATE "Business" SET "name" = 'Ace; Plumbing' WHERE "id" = '1';`;
  assert.deepEqual(splitStatements(sql), [
    `UPDATE "Business" SET "name" = 'Ace; Plumbing' WHERE "id" = '1'`,
  ]);
});

test("an escaped quote inside a literal does not leak out of string state", () => {
  const sql = `UPDATE "Business" SET "name" = 'Bob''s; Heating';\nDROP INDEX "x";`;
  assert.deepEqual(splitStatements(sql), [
    `UPDATE "Business" SET "name" = 'Bob''s; Heating'`,
    `DROP INDEX "x"`,
  ]);
});

test("comment-only input yields no statements to execute", () => {
  assert.deepEqual(splitStatements("-- nothing here\n-- or here\n"), []);
});

/*
  The tests above prove the splitter is right, which is not the same as proving
  the migration uses it — reverting just the call site back to `split(";")`
  leaves every one of them green and breaks production deploys again. This is
  the only assertion that fails on that change.
*/
test("the migration feeds the file through splitStatements, not a bare split", () => {
  const source = readFileSync(join(repoRoot, "scripts/turso-migrate.mjs"), "utf8");
  const executeLoop = source
    .split("\n")
    .find((line) => line.includes("for (const statement of"));

  assert.ok(executeLoop, "expected a loop over statements");
  assert.match(executeLoop, /splitStatements\(/);
});

test("every Prisma scalar column exists in the Turso base schema or a migration", () => {
  const schema = readFileSync(join(repoRoot, "prisma/schema.prisma"), "utf8");
  const baseSql = readFileSync(join(repoRoot, "prisma/turso-schema.sql"), "utf8");
  const created = new Map();
  const add = (table, column) => {
    if (!created.has(table)) created.set(table, new Set());
    created.get(table).add(column);
  };
  for (const sql of [baseSql, migrationSql]) {
    for (const [, table, body] of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"(\w+)" \(([\s\S]*?)\n\);/g)) {
      for (const [, column] of body.matchAll(/^\s*"(\w+)"/gm)) add(table, column);
    }
    for (const [, table, column] of sql.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/g)) add(table, column);
  }

  const scalar = /^(String|Int|Boolean|DateTime|Float|BigInt|Json|Decimal|Bytes)$/;
  const missing = [];
  for (const [, model, body] of schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
    for (const [, field, type] of body.matchAll(/^\s+(\w+)\s+(\w+)(?:\?|\[\])?/gm)) {
      if (scalar.test(type) && !created.get(model)?.has(field)) missing.push(`${model}.${field}`);
    }
  }
  assert.deepEqual(missing, [], `production would 500 selecting: ${missing.join(", ")}`);
});

/*
  Drift: a database built the way production was (baseline, then every
  migration the build replays) must match prisma/schema.prisma. A column added
  to the schema but not to turso-migrate.sql passes every local test, since
  `prisma db push` builds the local database from the schema, and then 500s
  on the first production query that selects it.

  Three tables carry known drift that only a table rebuild can fix, because
  SQLite cannot add a foreign key in place: Estimate has no leadId foreign key
  and Invoice has no jobId foreign key, so deleting a lead or job leaves the id
  behind instead of nulling it, and the baseline gave updatedAt a default.
  Prisma reports each as a whole-table redefinition. Those three are allowed
  only while the rebuilt table has exactly the columns the live one already
  has, so a missing column hidden inside a rebuild still fails.
*/
const KNOWN_REBUILDS = new Set(["Deposit", "Estimate", "Invoice"]);

test("a database built from the baseline plus every migration matches schema.prisma", async () => {
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { createClient } = await import("@libsql/client");

  const dir = mkdtempSync(join(tmpdir(), "drift-"));
  const dbPath = join(dir, "drift.db");
  try {
    const client = createClient({ url: `file:${dbPath}` });
    for (const file of ["prisma/turso-schema.sql", "prisma/turso-migrate.sql"]) {
      for (const statement of splitStatements(readFileSync(join(repoRoot, file), "utf8"))) {
        try {
          await client.execute(statement);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes("duplicate column") || msg.includes("already exists")) continue;
          throw new Error(`${file}: ${msg}\n${statement.slice(0, 200)}`);
        }
      }
    }
    client.close();

    const diff = execFileSync(
      "npx",
      ["prisma", "migrate", "diff", "--from-url", `file:${dbPath}`, "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    const rebuilt = new Set();
    const problems = [];
    for (const statement of splitStatements(diff)) {
      if (/^PRAGMA /.test(statement)) continue;
      const create = statement.match(/^CREATE TABLE "new_(\w+)" \(([\s\S]*)\)$/);
      if (create) {
        rebuilt.add(create[1]);
        if (!KNOWN_REBUILDS.has(create[1])) problems.push(`new table rebuild: ${create[1]}`);
        continue;
      }
      const insert = statement.match(/^INSERT INTO "new_(\w+)" \(([^)]*)\) SELECT/);
      if (insert) {
        const kept = new Set(insert[2].split(",").map((c) => c.trim().replace(/"/g, "")));
        const create = splitStatements(diff).find((s) => s.startsWith(`CREATE TABLE "new_${insert[1]}"`));
        const declared = [...create.matchAll(/^\s+"(\w+)" /gm)].map((m) => m[1]);
        const missing = declared.filter((c) => !kept.has(c));
        if (missing.length) problems.push(`${insert[1]} is missing columns: ${missing.join(", ")}`);
        continue;
      }
      const table = statement.match(/^(?:DROP TABLE|ALTER TABLE) "(?:new_)?(\w+)"|^CREATE (?:UNIQUE )?INDEX "\w+" ON "(\w+)"/);
      const name = table && (table[1] ?? table[2]);
      if (name && rebuilt.has(name)) continue;
      problems.push(statement.split("\n")[0]);
    }
    assert.deepEqual(problems, [], `schema.prisma and the production migrations disagree:\n${diff}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const SHA = "a".repeat(40);
const PLAN = migrationPlanSha256(migrationSql);
const approved = {
  MIGRATION_APPROVAL: "APPROVAL-1",
  MIGRATION_RELEASE_COMMIT: SHA,
  MIGRATION_TARGET: "production",
  MIGRATION_PLAN_SHA256: PLAN,
  MIGRATION_BACKUP_REF: "turso-pitr-2026-10-15T20:00Z",
};
const context = { headCommit: SHA, planSha256: PLAN, allowlist: { production: ["orvius-prod.turso.io"], preview: ["preview-iso.turso.io"] } };

test("a remote migration needs approval, the exact release, an allow-listed target, the reviewed checksum and a backup", () => {
  const prod = "libsql://orvius-prod.turso.io?authToken=x";
  assert.equal(migrationAuthorization(null, {}, context).action, "skip");
  assert.equal(migrationAuthorization("file:./dev.db", {}, context).action, "skip");
  assert.equal(migrationAuthorization(prod, approved, context).action, "migrate");
  const refusals = [
    [{ ...approved, VERCEL: "1" }, /never run inside a build/],
    [{ ...approved, VERCEL_ENV: "production", VERCEL: "1" }, /never run inside a build/],
    [{ ...approved, MIGRATION_APPROVAL: "" }, /MIGRATION_APPROVAL/],
    [{ ...approved, MIGRATION_RELEASE_COMMIT: "abc123" }, /full 40-character/],
    [{ ...approved, MIGRATION_RELEASE_COMMIT: "b".repeat(40) }, /not the approved release/],
    [{ ...approved, MIGRATION_TARGET: "" }, /MIGRATION_TARGET/],
    [{ ...approved, MIGRATION_TARGET: "preview" }, /not listed for preview/],
    [{ ...approved, MIGRATION_PLAN_SHA256: "0".repeat(64) }, /not the reviewed/],
    [{ ...approved, MIGRATION_BACKUP_REF: "" }, /MIGRATION_BACKUP_REF/],
  ];
  for (const [env, why] of refusals) {
    const result = migrationAuthorization(prod, env, context);
    assert.equal(result.action, "refuse", JSON.stringify(env));
    assert.match(result.reason, why);
  }
  assert.match(migrationAuthorization(prod, approved, { ...context, headCommit: null }).reason, /could not read the commit/);
  assert.match(migrationAuthorization("libsql://unknown.turso.io", approved, context).reason, /not listed for production/);
  const shared = { ...context, allowlist: { production: ["orvius-prod.turso.io"], preview: ["orvius-prod.turso.io"] } };
  assert.match(migrationAuthorization(prod, approved, shared).reason, /each environment needs its own database/);
  assert.equal(
    migrationAuthorization("libsql://preview-iso.turso.io", { ...approved, MIGRATION_TARGET: "preview" }, context).action,
    "migrate",
    "an isolated preview database is migrated under its own identity",
  );
});

test("builds are pure: the Vercel build command generates and compiles, and never migrates", () => {
  const vercel = JSON.parse(readFileSync(join(repoRoot, "vercel.json"), "utf8"));
  assert.doesNotMatch(vercel.buildCommand, /migrate|db push|seed|turso/i);
  const allow = JSON.parse(readFileSync(join(repoRoot, "ops/migration-targets.json"), "utf8"));
  // The allowlist is an owner decision, written down. Exactly one production
  // host may ever be named here (registered 2026-10-20 for the founder-
  // directed migration; the ledger row is the application record). Preview
  // and staging stay empty until their own isolated databases exist —
  // migrationAuthorization refuses a host listed under two targets anyway.
  assert.deepEqual(allow.production, ["orvius-marcocarlino2006-glitch.aws-us-east-1.turso.io"], "only the one registered production host is allow-listed");
  assert.deepEqual(allow.preview ?? [], [], "no preview database is allow-listed");
  assert.deepEqual(allow.staging ?? [], [], "no staging database is allow-listed");
});

test("a trigger body stays one statement", () => {
  const sql = `CREATE TRIGGER IF NOT EXISTS "t" BEFORE UPDATE ON "X" BEGIN SELECT RAISE(ABORT, 'no; never'); END;\nCREATE INDEX "i" ON "X"("a");`;
  assert.deepEqual(splitStatements(sql), [
    `CREATE TRIGGER IF NOT EXISTS "t" BEFORE UPDATE ON "X" BEGIN SELECT RAISE(ABORT, 'no; never'); END`,
    `CREATE INDEX "i" ON "X"("a")`,
  ]);
});

test("the migration refuses before it opens a connection", () => {
  const source = readFileSync(join(repoRoot, "scripts/turso-migrate.mjs"), "utf8");
  const main = source.slice(source.indexOf("async function main()"));
  assert.ok(main.indexOf('target.action === "refuse"') < main.indexOf("createClient("));
});

test("the remote target comes only from the environment, never a local .env file", () => {
  const source = readFileSync(join(repoRoot, "scripts/turso-migrate.mjs"), "utf8");
  assert.doesNotMatch(source, /resolve\(root, "\.env"\)|\.env"/);
});

test("only reviewed plan files can be applied, and the checksum binds the chosen file", async () => {
  const { migrationPlanFile, MIGRATION_PLAN_FILES } = await import("./turso-migrate.mjs");
  assert.equal(migrationPlanFile({}), "prisma/turso-migrate.sql");
  assert.equal(migrationPlanFile({ MIGRATION_PLAN_FILE: "prisma/prepared/receivables-v1.sql" }), "prisma/prepared/receivables-v1.sql");
  assert.equal(migrationPlanFile({ MIGRATION_PLAN_FILE: "/tmp/anything.sql" }), null);
  assert.equal(migrationPlanFile({ MIGRATION_PLAN_FILE: "prisma/turso-schema.sql" }), null);
  for (const file of MIGRATION_PLAN_FILES) {
    const sql = readFileSync(join(repoRoot, file), "utf8");
    const reviewed = migrationPlanSha256(sql);
    const prod = "libsql://orvius-prod.turso.io";
    const env = { ...approved, MIGRATION_PLAN_SHA256: reviewed };
    assert.equal(migrationAuthorization(prod, env, { ...context, planSha256: reviewed }).action, "migrate", file);
    assert.equal(migrationAuthorization(prod, env, { ...context, planSha256: migrationPlanSha256(sql + "\n") }).action, "refuse", `${file}: one changed byte refuses`);
  }
});

test("the merge-all release delta only adds, and a second run changes nothing", async () => {
  const { applyMigrationPlan, MIGRATION_LEDGER_TABLE } = await import("./turso-migrate.mjs");
  const { createClient } = await import("@libsql/client");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const planFile = "prisma/releases/2026-10-16-merge-all.sql";
  const sql = readFileSync(join(repoRoot, planFile), "utf8");
  const statements = splitStatements(sql);
  assert.equal(statements.length, 36);
  for (const s of statements) {
    assert.match(s, /^(ALTER TABLE "\w+" ADD COLUMN "\w+" TEXT|CREATE TABLE IF NOT EXISTS|CREATE (UNIQUE )?INDEX IF NOT EXISTS)/, s.slice(0, 80));
  }
  const dir = mkdtempSync(join(tmpdir(), "migrate-release-"));
  const client = createClient({ url: `file:${join(dir, "disposable.db")}` });
  try {
    await client.executeMultiple(`CREATE TABLE "Call" ("id" TEXT PRIMARY KEY); CREATE TABLE "CopilotAction" ("id" TEXT PRIMARY KEY); CREATE TABLE "NetworkHandoff" ("id" TEXT PRIMARY KEY); INSERT INTO "Call" VALUES ('c1');`);
    const tuple = { sql, planFile, planSha256: migrationPlanSha256(sql), release: SHA, target: "staging", host: "disposable", approval: "TEST-2", backupRef: "none-disposable" };
    await applyMigrationPlan(client, tuple);
    const shape = async () => (await client.execute(`SELECT type, name, sql FROM sqlite_master WHERE name <> '${MIGRATION_LEDGER_TABLE}' AND name NOT LIKE 'sqlite_%' ORDER BY type, name`)).rows.map((r) => `${r.type}:${r.name}:${r.sql}`);
    const first = await shape();
    await applyMigrationPlan(client, tuple);
    assert.deepEqual(await shape(), first);
    assert.equal(first.filter((s) => s.startsWith("table:")).length, 3 + 11);
    const { rows } = await client.execute(`SELECT "id", "slotOfferJson" FROM "Call"`);
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ id: "c1", slotOfferJson: null }]);
    const ledger = await client.execute(`SELECT "status" FROM "${MIGRATION_LEDGER_TABLE}"`);
    assert.deepEqual(ledger.rows.map((r) => r.status), ["applied", "applied"]);
  } finally {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the release schema check passes only when the live gap is the plan", async () => {
  const { compareToPlan } = await import("./release-schema-check.mjs");
  const plan = `-- c\nALTER TABLE "Call" ADD COLUMN "x" TEXT;\nCREATE TABLE IF NOT EXISTS "T" ("id" TEXT NOT NULL PRIMARY KEY);\n`;
  const gap = `-- CreateTable\nCREATE TABLE "T" (\n  "id" TEXT NOT NULL PRIMARY KEY\n);\n-- AlterTable\nALTER TABLE "Call" ADD COLUMN "x" TEXT;\n`;
  assert.deepEqual(compareToPlan(gap, plan), { unexpected: [], alreadyPresent: [] });
  assert.deepEqual(compareToPlan("-- This is an empty migration.", null), { unexpected: [], alreadyPresent: [] });
  assert.deepEqual(compareToPlan(`${gap}DROP TABLE "Leftover";`, plan).unexpected, ['DROP TABLE "Leftover"']);
  assert.deepEqual(compareToPlan(`ALTER TABLE "Call" ADD COLUMN "x" TEXT;`, plan).alreadyPresent, ['CREATE TABLE "T" ("id" TEXT NOT NULL PRIMARY KEY)']);
  const source = readFileSync(join(repoRoot, "scripts/release-schema-check.mjs"), "utf8");
  assert.doesNotMatch(source, /SELECT \* FROM|loadEnvFile|\.env"/, "reads definitions only, and never a local .env");
});

test("the receivables SQL, split by this step, builds the same guards on a disposable database and records the applied release", async () => {
  const { applyMigrationPlan, MIGRATION_LEDGER_TABLE } = await import("./turso-migrate.mjs");
  const { createClient } = await import("@libsql/client");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "migrate-plan-"));
  const client = createClient({ url: `file:${join(dir, "disposable.db")}` });
  try {
    await client.execute("PRAGMA foreign_keys = ON");
    await client.executeMultiple(`CREATE TABLE "Business" ("id" TEXT PRIMARY KEY); CREATE TABLE "Job" ("id" TEXT PRIMARY KEY, "businessId" TEXT); INSERT INTO "Business" VALUES ('b'); INSERT INTO "Job" VALUES ('j','b');`);
    const sql = readFileSync(join(repoRoot, "prisma/prepared/receivables-v1.sql"), "utf8");
    const triggers = splitStatements(sql).filter((s) => /^CREATE TRIGGER/i.test(s));
    assert.equal(triggers.length, 5);
    for (const t of triggers) assert.match(t, /\bEND$/, "each trigger is one whole statement");
    const tuple = { sql, planFile: "prisma/prepared/receivables-v1.sql", planSha256: migrationPlanSha256(sql), release: SHA, target: "staging", host: "disposable", approval: "TEST-1", backupRef: "none-disposable" };
    await applyMigrationPlan(client, tuple);
    await applyMigrationPlan(client, tuple);
    const { rows: names } = await client.execute(`SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name`);
    assert.equal(names.length, 5);
    await client.execute(`INSERT INTO "JobReceivable" ("id","businessId","jobId","canonical") VALUES ('r1','b','j',1)`);
    await assert.rejects(client.execute(`INSERT INTO "JobReceivable" ("id","businessId","jobId","canonical") VALUES ('r2','b','j',1)`), /UNIQUE/);
    await client.execute(`INSERT INTO "ReceivableFact" ("id","businessId","receivableId","revision","kind","amountCents","occurredAt") VALUES ('f1','b','r1',1,'payment',100,'2026-10-15')`);
    await assert.rejects(client.execute(`UPDATE "ReceivableFact" SET "amountCents"=1`), /append-only/);
    const { rows } = await client.execute(`SELECT "releaseCommit","target","planFile","planSha256","approval","backupRef","status" FROM "${MIGRATION_LEDGER_TABLE}" ORDER BY "id"`);
    assert.equal(rows.length, 2);
    assert.deepEqual({ ...rows[0] }, { releaseCommit: SHA, target: "staging", planFile: tuple.planFile, planSha256: tuple.planSha256, approval: "TEST-1", backupRef: "none-disposable", status: "applied" });
  } finally {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
