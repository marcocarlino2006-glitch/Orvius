import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import {
  FIND_COLUMNS,
  FIND_INDEXES,
  FIND_STATEMENTS,
  approvalOk,
  backupRefOk,
  ensureFindTables,
  findPlanSha256,
  relationMissing,
} from "../src/lib/find-schema.ts";
import { applyFindRelease } from "./apply-find-schema.mjs";

const migration = readFileSync(new URL("../prisma/turso-migrate.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/find-schema.yml", import.meta.url), "utf8");

test("the statements are the find section of the reviewed migration", () => {
  for (const statement of FIND_STATEMENTS) assert.ok(migration.includes(statement), statement.slice(0, 80));
  assert.equal(findPlanSha256().length, 64);
  assert.equal(approvalOk("Find a shop: VisitReview and AreaRequest on production"), true);
  assert.equal(backupRefOk("actions-run/123"), true);
  assert.equal(relationMissing(new Error("The table `main.VisitReview` does not exist in the current database."), "VisitReview"), true);
  assert.equal(relationMissing(new Error("no such table: AreaRequest"), "AreaRequest"), true);
  assert.equal(relationMissing(new Error("database is locked"), "VisitReview"), false);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /contains\(github\.event\.head_commit\.message, 'find-live'\)/);
  assert.doesNotMatch(workflow, /schedule:|curl .*api\/cron|pull_request/);
  assert.match(workflow, /DRAIN_TARGET_URL: https:\/\/orvius\.im/);
  assert.match(workflow, /DRAIN_EXPECTED_RELEASE: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /apply-find-schema\.mjs/);
});

function runner(client) {
  return {
    execute: async (sql, args = []) => {
      await client.execute({ sql, args });
    },
    query: async (sql, args = []) => (await client.execute({ sql, args })).rows,
  };
}

test("creating the find tables is idempotent and recorded against the backup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "find-schema-"));
  const client = createClient({ url: `file:${join(dir, "schema.db")}` });
  try {
    const meta = {
      release: "a".repeat(40),
      target: "production",
      host: "orvius.im",
      approval: "Find a shop: VisitReview and AreaRequest on production",
      backupRef: "actions-run/123",
    };
    const first = await ensureFindTables(runner(client), meta);
    assert.equal(first.alreadyPresent, false);
    assert.deepEqual(first.tables, ["VisitReview", "AreaRequest"]);
    const again = await ensureFindTables(runner(client), { ...meta, backupRef: "actions-run/124" });
    assert.equal(again.alreadyPresent, true);

    for (const table of ["VisitReview", "AreaRequest"]) {
      const columns = (await client.execute(`SELECT name FROM pragma_table_info('${table}')`)).rows.map((row) => String(row.name));
      for (const column of FIND_COLUMNS[table]) assert.ok(columns.includes(column), column);
      const indexes = (await client.execute(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '${table}'`)).rows.map((row) => String(row.name));
      for (const index of FIND_INDEXES[table]) assert.ok(indexes.includes(index), index);
    }

    const ledger = await client.execute(`SELECT "status","backupRef","planFile" FROM "_OrviusReleaseMigration" ORDER BY "id"`);
    assert.equal(ledger.rows.length, 2);
    assert.equal(String(ledger.rows[0].status), "applied");
    assert.equal(String(ledger.rows[1].backupRef), "actions-run/124");
    assert.equal(String(ledger.rows[0].planFile), "prisma/turso-migrate.sql#Find");
  } finally {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed statement stays started and does not claim the tables are ready", async () => {
  const dir = mkdtempSync(join(tmpdir(), "find-schema-"));
  const client = createClient({ url: `file:${join(dir, "schema.db")}` });
  const db = runner(client);
  const real = db.execute;
  db.execute = async (sql, args) => {
    if (sql.includes("AreaRequest_leadId_key")) throw new Error("disk full");
    return real(sql, args);
  };
  try {
    await assert.rejects(
      () => ensureFindTables(db, {
        release: "b".repeat(40),
        target: "production",
        host: "orvius.im",
        approval: "Find a shop: VisitReview and AreaRequest on production",
        backupRef: "actions-run/9",
      }),
      /still started/,
    );
    const ledger = await client.execute(`SELECT "status" FROM "_OrviusReleaseMigration"`);
    assert.equal(String(ledger.rows[0].status), "started");
  } finally {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

const RELEASE = "e".repeat(40);
const targets = { production: ["orvius.im"], preview: [], staging: [] };
const env = {
  CRON_SECRET: "cron-test",
  DRAIN_TARGET_ENV: "production",
  DRAIN_TARGET_URL: "https://orvius.im",
  DRAIN_EXPECTED_RELEASE: RELEASE,
  MIGRATION_APPROVAL: "Find a shop: VisitReview and AreaRequest on production",
  MIGRATION_BACKUP_REF: "actions-run/55",
};

function fakeFetch(health) {
  const calls = [];
  let written = false;
  const impl = async (url, init = {}) => {
    calls.push({ path: new URL(url).pathname, method: init.method ?? "GET", headers: init.headers ?? {}, written });
    if (url.endsWith("/api/health")) return new Response(JSON.stringify({ release: health }), { status: 200 });
    if (url.endsWith("/api/cron/backup")) {
      return new Response(Buffer.from("encrypted-backup-bytes"), {
        status: 200,
        headers: { "x-orvius-backup": "tables=2;rows=3;restored=ok" },
      });
    }
    return new Response(JSON.stringify({ ok: true, tables: ["VisitReview", "AreaRequest"] }), { status: 200 });
  };
  return {
    calls,
    impl,
    writeFile: () => {
      written = true;
    },
  };
}

test("a deployment that is not this release is not backed up and not altered", async () => {
  const f = fakeFetch({ environment: "production", commit: "f".repeat(40) });
  const result = await applyFindRelease({ env, targets, fetchImpl: f.impl, writeFile: f.writeFile, deadlineMs: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "identity");
  assert.deepEqual(f.calls.map((call) => call.path), ["/api/health"]);
});

test("the backup is saved before the find tables are requested, and only on this release", async () => {
  const f = fakeFetch({ environment: "production", commit: RELEASE });
  const result = await applyFindRelease({ env, targets, fetchImpl: f.impl, writeFile: f.writeFile, deadlineMs: 0 });
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls.map((call) => call.path), ["/api/health", "/api/cron/backup", "/api/cron/find-schema"]);
  assert.equal(f.calls[1].written, false);
  assert.equal(f.calls[2].written, true);
  assert.equal(f.calls[2].method, "POST");
  assert.equal(f.calls[2].headers["x-orvius-backup-ref"], "actions-run/55");
  assert.equal(f.calls[2].headers["x-orvius-plan-sha256"], findPlanSha256());
  assert.equal(f.calls[2].headers.authorization, "Bearer cron-test");
});

test("a backup whose restore drill did not pass does not change the schema", async () => {
  const calls = [];
  const impl = async (url) => {
    calls.push(new URL(url).pathname);
    if (url.endsWith("/api/health")) {
      return new Response(JSON.stringify({ release: { environment: "production", commit: RELEASE } }), { status: 200 });
    }
    return new Response("drill failed", { status: 200, headers: { "x-orvius-backup": "restored=no" } });
  };
  let wrote = false;
  const result = await applyFindRelease({
    env,
    targets,
    fetchImpl: impl,
    writeFile: () => {
      wrote = true;
    },
    deadlineMs: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "backup");
  assert.equal(wrote, false);
  assert.deepEqual(calls, ["/api/health", "/api/cron/backup"]);
});
