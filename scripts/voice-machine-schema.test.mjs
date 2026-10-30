import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createClient } from "@libsql/client";
import { approvalOk, backupRefOk, ensureVoiceMachineColumn, voiceMachinePlanSha256 } from "../src/lib/voice-machine-schema.ts";
import { applyVoiceMachineRelease } from "./apply-voice-machine-schema.mjs";

const workflow = readFileSync(new URL("../.github/workflows/voice-machine-schema.yml", import.meta.url), "utf8");

test("the workflow needs no database secret and runs only on the named merge or by hand", () => {
  assert.equal(approvalOk("Voice machine: Business column on production"), true);
  assert.equal(backupRefOk("actions-run/123"), true);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /contains\(github\.event\.head_commit\.message, 'voice-machine-column'\)/);
  assert.doesNotMatch(workflow, /DATABASE_URL|TURSO_AUTH_TOKEN|schedule:|pull_request/);
  assert.match(workflow, /DRAIN_TARGET_URL: https:\/\/orvius\.im/);
  assert.match(workflow, /DRAIN_EXPECTED_RELEASE: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /apply-voice-machine-schema\.mjs/);
});

function runner(client) {
  return {
    execute: async (sql, args = []) => {
      await client.execute({ sql, args });
    },
    query: async (sql, args = []) => (await client.execute({ sql, args })).rows,
  };
}

const meta = {
  release: "a".repeat(40),
  target: "production",
  host: "orvius.im",
  approval: "Voice machine: Business column on production",
  backupRef: "actions-run/123",
};

test("every shop keeps the door it answers on today, and a second run changes nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-machine-schema-"));
  const client = createClient({ url: `file:${join(dir, "schema.db")}` });
  try {
    await client.execute(`CREATE TABLE "Business" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT)`);
    await client.execute(`INSERT INTO "Business" ("id", "name") VALUES ('shop-a', 'A'), ('shop-b', 'B')`);

    const first = await ensureVoiceMachineColumn(runner(client), meta);
    assert.equal(first.alreadyPresent, false);
    const rows = (await client.execute(`SELECT "id", "voiceMachineId" FROM "Business" ORDER BY "id"`)).rows;
    assert.deepEqual(rows.map((r) => [String(r.id), String(r.voiceMachineId)]), [["shop-a", "shop-a"], ["shop-b", "shop-b"]]);

    await client.execute(`UPDATE "Business" SET "voiceMachineId" = 'minted-later' WHERE "id" = 'shop-b'`);
    const again = await ensureVoiceMachineColumn(runner(client), { ...meta, backupRef: "actions-run/124" });
    assert.equal(again.alreadyPresent, true);
    const b = (await client.execute(`SELECT "voiceMachineId" FROM "Business" WHERE "id" = 'shop-b'`)).rows[0];
    assert.equal(String(b.voiceMachineId), "minted-later", "a machine id already stored is never overwritten");

    await assert.rejects(
      () => client.execute(`UPDATE "Business" SET "voiceMachineId" = 'shop-a' WHERE "id" = 'shop-b'`),
      /UNIQUE/,
      "two shops can never share a door",
    );
    const ledger = await client.execute(`SELECT "status","planFile" FROM "_OrviusReleaseMigration" ORDER BY "id"`);
    assert.deepEqual(ledger.rows.map((r) => String(r.status)), ["applied", "applied"]);
    assert.equal(String(ledger.rows[0].planFile), "src/lib/voice-machine-schema.ts#VOICE_MACHINE_STATEMENTS");
  } finally {
    client.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed statement stays started and does not claim the column is ready", async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-machine-schema-"));
  const client = createClient({ url: `file:${join(dir, "schema.db")}` });
  const db = runner(client);
  const real = db.execute;
  db.execute = async (sql, args) => {
    if (sql.startsWith("UPDATE \"Business\"")) throw new Error("disk full");
    return real(sql, args);
  };
  try {
    await client.execute(`CREATE TABLE "Business" ("id" TEXT NOT NULL PRIMARY KEY)`);
    await client.execute(`INSERT INTO "Business" ("id") VALUES ('shop-a')`);
    await assert.rejects(() => ensureVoiceMachineColumn(db, { ...meta, backupRef: "actions-run/9" }), /still started/);
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
  MIGRATION_APPROVAL: "Voice machine: Business column on production",
  MIGRATION_BACKUP_REF: "actions-run/55",
};

test("the backup is saved before the column is requested, and only on this release", async () => {
  const calls = [];
  let written = false;
  const impl = async (url, init = {}) => {
    calls.push({ path: new URL(url).pathname, headers: init.headers ?? {}, written });
    if (url.endsWith("/api/health")) return new Response(JSON.stringify({ release: { environment: "production", commit: RELEASE } }), { status: 200 });
    if (url.endsWith("/api/cron/backup")) {
      return new Response(Buffer.from("encrypted-backup-bytes"), { status: 200, headers: { "x-orvius-backup": "tables=2;rows=3;restored=ok" } });
    }
    return new Response(JSON.stringify({ ok: true, columns: ["voiceMachineId"] }), { status: 200 });
  };
  const result = await applyVoiceMachineRelease({ env, targets, fetchImpl: impl, writeFile: () => (written = true), deadlineMs: 0 });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map((c) => c.path), ["/api/health", "/api/cron/backup", "/api/cron/voice-machine-schema"]);
  assert.equal(calls[2].written, true);
  assert.equal(calls[2].headers["x-orvius-plan-sha256"], voiceMachinePlanSha256());

  const wrong = [];
  const other = async (url) => {
    wrong.push(new URL(url).pathname);
    return new Response(JSON.stringify({ release: { environment: "production", commit: "f".repeat(40) } }), { status: 200 });
  };
  const refused = await applyVoiceMachineRelease({ env, targets, fetchImpl: other, writeFile: () => {}, deadlineMs: 0 });
  assert.equal(refused.stage, "identity");
  assert.deepEqual(wrong, ["/api/health"]);
});
