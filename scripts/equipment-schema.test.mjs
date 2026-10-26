import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import {
  EQUIPMENT_COLUMNS,
  EQUIPMENT_STATEMENTS,
  approvalOk,
  backupRefOk,
  ensureEquipmentColumns,
  equipmentPlanSha256,
} from "../src/lib/equipment-schema.ts";
import { applyEquipmentRelease } from "./apply-equipment-schema.mjs";

const migration = readFileSync(new URL("../prisma/turso-migrate.sql", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/equipment-schema.yml", import.meta.url), "utf8");

test("the statements are the equipment section of the reviewed migration", () => {
  for (const statement of EQUIPMENT_STATEMENTS) assert.ok(migration.includes(statement), statement);
  assert.equal(equipmentPlanSha256().length, 64);
  assert.equal(approvalOk("Caller equipment: Lead columns on production"), true);
  assert.equal(backupRefOk("actions-run/123"), true);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /contains\(github\.event\.head_commit\.message, 'equipment-columns'\)/);
  assert.doesNotMatch(workflow, /schedule:|curl .*api\/cron|pull_request/);
  assert.match(workflow, /DRAIN_TARGET_URL: https:\/\/orvius\.im/);
  assert.match(workflow, /DRAIN_EXPECTED_RELEASE: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /apply-equipment-schema\.mjs/);
});

function runner(client) {
  return {
    execute: async (sql, args = []) => {
      await client.execute({ sql, args });
    },
    query: async (sql, args = []) => (await client.execute({ sql, args })).rows,
  };
}

async function leadWithoutEquipment(client) {
  await client.execute(`CREATE TABLE "Lead" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT)`);
  await client.execute(`INSERT INTO "Lead" ("id", "name") VALUES ('lead-1', 'Ana')`);
}

test("adding the equipment columns is idempotent and a lead can be read with them", async () => {
  const dir = mkdtempSync(join(tmpdir(), "equipment-schema-"));
  const client = createClient({ url: `file:${join(dir, "schema.db")}` });
  try {
    await leadWithoutEquipment(client);
    const meta = {
      release: "a".repeat(40),
      target: "production",
      host: "orvius.im",
      approval: "Caller equipment: Lead columns on production",
      backupRef: "actions-run/123",
    };
    const first = await ensureEquipmentColumns(runner(client), meta);
    assert.equal(first.alreadyPresent, false);
    assert.deepEqual([...first.columns], [...EQUIPMENT_COLUMNS]);
    const again = await ensureEquipmentColumns(runner(client), { ...meta, backupRef: "actions-run/124" });
    assert.equal(again.alreadyPresent, true);

    const columns = (await client.execute(`SELECT name FROM pragma_table_info('Lead')`)).rows.map((row) => String(row.name));
    for (const column of EQUIPMENT_COLUMNS) assert.ok(columns.includes(column), column);
    const row = await client.execute(
      `SELECT "systemType", "equipmentBrand", "equipmentModel" FROM "Lead" WHERE "id" = 'lead-1'`,
    );
    assert.equal(row.rows[0].systemType, null);
    assert.equal(row.rows[0].equipmentBrand, null);
    assert.equal(row.rows[0].equipmentModel, null);

    const ledger = await client.execute(`SELECT "status","backupRef","planFile" FROM "_OrviusReleaseMigration" ORDER BY "id"`);
    assert.equal(ledger.rows.length, 2);
    assert.equal(String(ledger.rows[0].status), "applied");
    assert.equal(String(ledger.rows[1].backupRef), "actions-run/124");
    assert.equal(String(ledger.rows[0].planFile), "prisma/turso-migrate.sql#LeadEquipment");
  } finally {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed statement stays started and does not claim the columns are ready", async () => {
  const dir = mkdtempSync(join(tmpdir(), "equipment-schema-"));
  const client = createClient({ url: `file:${join(dir, "schema.db")}` });
  const db = runner(client);
  const real = db.execute;
  db.execute = async (sql, args) => {
    if (sql.includes("equipmentModel")) throw new Error("disk full");
    return real(sql, args);
  };
  try {
    await leadWithoutEquipment(client);
    await assert.rejects(
      () => ensureEquipmentColumns(db, {
        release: "b".repeat(40),
        target: "production",
        host: "orvius.im",
        approval: "Caller equipment: Lead columns on production",
        backupRef: "actions-run/9",
      }),
      /still started/,
    );
    const ledger = await client.execute(`SELECT "status" FROM "_OrviusReleaseMigration"`);
    assert.equal(String(ledger.rows[0].status), "started");
    const columns = (await client.execute(`SELECT name FROM pragma_table_info('Lead')`)).rows.map((row) => String(row.name));
    assert.equal(columns.includes("equipmentModel"), false);
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
  MIGRATION_APPROVAL: "Caller equipment: Lead columns on production",
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
    return new Response(JSON.stringify({ ok: true, columns: ["systemType", "equipmentBrand", "equipmentModel"] }), { status: 200 });
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
  const result = await applyEquipmentRelease({ env, targets, fetchImpl: f.impl, writeFile: f.writeFile, deadlineMs: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.stage, "identity");
  assert.deepEqual(f.calls.map((call) => call.path), ["/api/health"]);
});

test("the backup is saved before the equipment columns are requested, and only on this release", async () => {
  const f = fakeFetch({ environment: "production", commit: RELEASE });
  const result = await applyEquipmentRelease({ env, targets, fetchImpl: f.impl, writeFile: f.writeFile, deadlineMs: 0 });
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls.map((call) => call.path), ["/api/health", "/api/cron/backup", "/api/cron/equipment-schema"]);
  assert.equal(f.calls[1].written, false);
  assert.equal(f.calls[2].written, true);
  assert.equal(f.calls[2].method, "POST");
  assert.equal(f.calls[2].headers["x-orvius-backup-ref"], "actions-run/55");
  assert.equal(f.calls[2].headers["x-orvius-plan-sha256"], equipmentPlanSha256());
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
  const result = await applyEquipmentRelease({
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
