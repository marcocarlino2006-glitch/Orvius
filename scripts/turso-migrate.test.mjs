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
import { splitStatements } from "./turso-migrate.mjs";

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
