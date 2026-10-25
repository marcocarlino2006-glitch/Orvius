import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import {
  PART_STOCK_COLUMNS,
  PART_STOCK_INDEXES,
  PART_STOCK_STATEMENTS,
  approvalOk,
  ensurePartStock,
  partStockPlanSha256,
} from "../src/lib/part-stock-schema.ts";
import { applyPartStockRelease } from "./apply-part-stock-schema.mjs";

const migration = readFileSync(new URL("../prisma/turso-migrate.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/part-stock-schema.yml", import.meta.url), "utf8");

test("the statements are the truck section of the reviewed migration", () => {
  for (const statement of PART_STOCK_STATEMENTS) assert.ok(migration.includes(statement), statement.slice(0, 80));
  assert.equal(partStockPlanSha256().length, 64);
  assert.equal(approvalOk("Truck counts: PartStock on production"), true);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /contains\(github\.event\.head_commit\.message, 'truck-stock'\)/);
  assert.doesNotMatch(workflow, /schedule:|curl .*api\/cron|pull_request/);
  assert.match(workflow, /DRAIN_TARGET_URL: https:\/\/orvius\.im/);
  assert.match(workflow, /DRAIN_EXPECTED_RELEASE: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /apply-part-stock-schema\.mjs/);
});

function runner(client) {
  return {
    execute: async (sql, args = []) => {
      await client.execute({ sql, args });
    },
    query: async (sql, args = []) => (await client.execute({ sql, args })).rows,
  };
}

test("creating the truck count table is idempotent and recorded against the backup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "part-stock-"));
  const client = createClient({ url: `file:${join(dir, "schema.db")}` });
  try {
    const meta = {
      release: "a".repeat(40),
      target: "production",
      host: "orvius.im",
      approval: "Truck counts: PartStock on production",
      backupRef: "actions-run/123",
    };
    const first = await ensurePartStock(runner(client), meta);
    assert.equal(first.alreadyPresent, false);
    assert.deepEqual(first.tables, ["PartStock"]);
    const again = await ensurePartStock(runner(client), { ...meta, backupRef: "actions-run/124" });
    assert.equal(again.alreadyPresent, true);
    const columns = (await client.execute(`SELECT name FROM pragma_table_info('PartStock')`)).rows.map((row) => String(row.name));
    for (const column of PART_STOCK_COLUMNS) assert.ok(columns.includes(column), column);
    const indexes = (await client.execute(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'PartStock'`)).rows.map((row) => String(row.name));
    for (const index of PART_STOCK_INDEXES) assert.ok(indexes.includes(index), index);
    const ledger = await client.execute(`SELECT "status","planFile" FROM "_OrviusReleaseMigration" ORDER BY "id"`);
    assert.equal(String(ledger.rows[0].status), "applied");
    assert.equal(String(ledger.rows[0].planFile), "prisma/turso-migrate.sql#PartStock");
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
  MIGRATION_APPROVAL: "Truck counts: PartStock on production",
  MIGRATION_BACKUP_REF: "actions-run/55",
};

test("a deployment that is not this release is not backed up and not altered", async () => {
  const calls = [];
  const result = await applyPartStockRelease({
    env,
    targets,
    fetchImpl: async (url) => {
      calls.push(new URL(url).pathname);
      return new Response(JSON.stringify({ release: { environment: "production", commit: "f".repeat(40) } }), { status: 200 });
    },
    writeFile: () => {},
    deadlineMs: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "identity");
  assert.deepEqual(calls, ["/api/health"]);
});

test("the backup is saved before the truck table is requested", async () => {
  const calls = [];
  let written = false;
  const result = await applyPartStockRelease({
    env,
    targets,
    fetchImpl: async (url, init = {}) => {
      calls.push({ path: new URL(url).pathname, method: init.method ?? "GET", written });
      if (url.endsWith("/api/health")) {
        return new Response(JSON.stringify({ release: { environment: "production", commit: RELEASE } }), { status: 200 });
      }
      if (url.endsWith("/api/cron/backup")) {
        return new Response(Buffer.from("encrypted-backup-bytes"), {
          status: 200,
          headers: { "x-orvius-backup": "tables=2;rows=3;restored=ok" },
        });
      }
      return new Response(JSON.stringify({ ok: true, tables: ["PartStock"] }), { status: 200 });
    },
    writeFile: () => {
      written = true;
    },
    deadlineMs: 0,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/health", "/api/cron/backup", "/api/cron/part-stock-schema"],
  );
  assert.equal(calls[2].written, true);
  assert.equal(calls[2].method, "POST");
  assert.equal(written, true);
});
