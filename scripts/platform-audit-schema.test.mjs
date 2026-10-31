import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import {
  PLATFORM_AUDIT_COLUMNS,
  PLATFORM_AUDIT_INDEXES,
  PLATFORM_AUDIT_STATEMENTS,
  approvalOk,
  ensurePlatformAuditEvent,
  platformAuditPlanSha256,
} from "../src/lib/platform-audit-schema.ts";
import { applyPlatformAuditEventRelease } from "./apply-platform-audit-schema.mjs";

const migration = readFileSync(new URL("../prisma/turso-migrate.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/platform-audit-schema.yml", import.meta.url), "utf8");

test("the statements are the admin audit section of the reviewed migration", () => {
  for (const statement of PLATFORM_AUDIT_STATEMENTS) assert.ok(migration.includes(statement), statement.slice(0, 80));
  assert.equal(platformAuditPlanSha256().length, 64);
  assert.equal(approvalOk("Admin audit: PlatformAuditEvent on production"), true);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /contains\(github\.event\.head_commit\.message, 'admin-audit'\)/);
  assert.doesNotMatch(workflow, /schedule:|curl .*api\/cron|pull_request/);
  assert.match(workflow, /DRAIN_TARGET_URL: https:\/\/orvius\.im/);
  assert.match(workflow, /DRAIN_EXPECTED_RELEASE: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /apply-platform-audit-schema\.mjs/);
});

function runner(client) {
  return {
    execute: async (sql, args = []) => {
      await client.execute({ sql, args });
    },
    query: async (sql, args = []) => (await client.execute({ sql, args })).rows,
  };
}

test("creating the admin audit table is idempotent and recorded against the backup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "platform-audit-"));
  const client = createClient({ url: `file:${join(dir, "schema.db")}` });
  try {
    const meta = {
      release: "a".repeat(40),
      target: "production",
      host: "orvius.im",
      approval: "Admin audit: PlatformAuditEvent on production",
      backupRef: "actions-run/123",
    };
    const first = await ensurePlatformAuditEvent(runner(client), meta);
    assert.equal(first.alreadyPresent, false);
    assert.deepEqual(first.tables, ["PlatformAuditEvent"]);
    const again = await ensurePlatformAuditEvent(runner(client), { ...meta, backupRef: "actions-run/124" });
    assert.equal(again.alreadyPresent, true);
    const columns = (await client.execute(`SELECT name FROM pragma_table_info('PlatformAuditEvent')`)).rows.map((row) => String(row.name));
    for (const column of PLATFORM_AUDIT_COLUMNS) assert.ok(columns.includes(column), column);
    const indexes = (await client.execute(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'PlatformAuditEvent'`)).rows.map((row) => String(row.name));
    for (const index of PLATFORM_AUDIT_INDEXES) assert.ok(indexes.includes(index), index);
    const ledger = await client.execute(`SELECT "status","planFile" FROM "_OrviusReleaseMigration" ORDER BY "id"`);
    assert.equal(String(ledger.rows[0].status), "applied");
    assert.equal(String(ledger.rows[0].planFile), "prisma/turso-migrate.sql#PlatformAuditEvent");
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
  MIGRATION_APPROVAL: "Admin audit: PlatformAuditEvent on production",
  MIGRATION_BACKUP_REF: "actions-run/55",
};

test("a deployment that is not this release is not backed up and not altered", async () => {
  const calls = [];
  const result = await applyPlatformAuditEventRelease({
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

test("the backup is saved before the admin audit table is requested", async () => {
  const calls = [];
  let written = false;
  const result = await applyPlatformAuditEventRelease({
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
      return new Response(JSON.stringify({ ok: true, tables: ["PlatformAuditEvent"] }), { status: 200 });
    },
    writeFile: () => {
      written = true;
    },
    deadlineMs: 0,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    calls.map((call) => call.path),
    ["/api/health", "/api/cron/backup", "/api/cron/platform-audit-schema"],
  );
  assert.equal(calls[2].written, true);
  assert.equal(calls[2].method, "POST");
  assert.equal(written, true);
});
