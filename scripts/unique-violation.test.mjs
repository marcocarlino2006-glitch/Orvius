import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isUniqueViolation } from "../src/lib/unique-violation.ts";

test("a duplicate is recognised whichever way the database reports it", () => {
  assert.equal(isUniqueViolation(Object.assign(new Error("x"), { code: "P2002" })), true);
  const libsql = new Error(
    'Invalid `prisma.ownerNotification.create()` invocation:\n\nError occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(SqliteError { extended_code: 1, message: Some("SQLITE_CONSTRAINT: SQLite error: UNIQUE constraint failed: OwnerNotification.businessId, OwnerNotification.dedupeKey, OwnerNotification.channel") }), transient: false })',
  );
  assert.equal(isUniqueViolation(libsql), true);
  assert.equal(isUniqueViolation(new Error("outer", { cause: new Error("UNIQUE constraint failed: Call.vapiCallId") })), true);
});

test("other failures are not mistaken for a duplicate", () => {
  assert.equal(isUniqueViolation(new Error("database is locked")), false);
  assert.equal(isUniqueViolation(new Error("NOT NULL constraint failed: Call.businessId")), false);
  assert.equal(isUniqueViolation(Object.assign(new Error("x"), { code: "P2025" })), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(undefined), false);
});

test("no code path checks for the duplicate by Prisma's code alone", () => {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !path.endsWith("unique-violation.ts")) {
        const text = readFileSync(path, "utf8");
        if (/code\s*[!=]==\s*"P2002"/.test(text)) hits.push(path);
      }
    }
  };
  walk(new URL("../src", import.meta.url).pathname);
  assert.deepEqual(hits, []);
});

test("the line watch says why a line could not be repaired", () => {
  const watch = readFileSync(new URL("../src/lib/line-watch.ts", import.meta.url), "utf8");
  assert.match(watch, /line_watch\.address_mismatch/);
  assert.match(watch, /line_watch\.repair_failed/);
});
