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
