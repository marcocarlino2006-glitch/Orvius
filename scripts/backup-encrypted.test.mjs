#!/usr/bin/env node
/*
 * Nightly backups: stored only encrypted, readable only with the key, and
 * drilled from the file actually written.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";

import { decryptDump, encryptDump, isEncrypted, readDump } from "./db-backup.mjs";

const KEY = "k".repeat(40);
const dump = {
  format: "orvius-backup/1",
  at: "2026-09-29T00:00:00.000Z",
  tables: [{ name: "Lead", sql: 'CREATE TABLE "Lead" ("id" TEXT PRIMARY KEY, "phone" TEXT)', columns: ["id", "phone"], rows: [["a", "+15551234567"]] }],
  indexes: [],
};

test("an encrypted backup round-trips and carries no readable customer data", () => {
  const buf = encryptDump(dump, KEY);
  assert.ok(isEncrypted(buf));
  assert.ok(!buf.includes(Buffer.from("+15551234567")));
  assert.ok(!buf.includes(Buffer.from("Lead")));
  assert.deepEqual(decryptDump(buf, KEY), dump);
});

test("the wrong key, a short key or a tampered file never yields a backup", () => {
  const buf = encryptDump(dump, KEY);
  assert.throws(() => decryptDump(buf, "x".repeat(40)));
  assert.throws(() => encryptDump(dump, "short"), /at least 32/);
  const tampered = Buffer.from(buf);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => decryptDump(tampered, KEY));
});

test("the drill command backs up, encrypts, and restores from the written file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "orvius-backup-test-"));
  try {
    const src = createClient({ url: `file:${join(dir, "src.db")}` });
    await src.execute('CREATE TABLE "Lead" ("id" TEXT PRIMARY KEY, "phone" TEXT)');
    await src.batch(Array.from({ length: 30 }, (_, i) => ({ sql: 'INSERT INTO "Lead" VALUES (?, ?)', args: [`l${i}`, `+1555000${i}`] })), "write");
    src.close();
    const out = join(dir, "out", "b.json.enc");
    const env = { ...process.env, DATABASE_URL: `file:${join(dir, "src.db")}`, BACKUP_ENCRYPTION_KEY: KEY };
    const log = execFileSync("node", ["scripts/db-backup.mjs", "drill", "--encrypt", "--out", out], { env, encoding: "utf8" });
    assert.match(log, /1 tables, 30 rows restored/);
    assert.ok(isEncrypted(readFileSync(out)));
    assert.equal(readDump(out, KEY).tables[0].rows.length, 30);
    assert.deepEqual(readdirSync(join(dir, "out")), ["b.json.enc"]);

    assert.throws(
      () => execFileSync("node", ["scripts/db-backup.mjs", "backup", "--encrypt", "--out", join(dir, "nokey.enc")], { env: { ...env, BACKUP_ENCRYPTION_KEY: "" }, stdio: "pipe" }),
      /at least 32/,
    );
    assert.deepEqual(readdirSync(dir).sort(), ["out", "src.db"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the nightly workflow stores only the encrypted file and alerts on failure", () => {
  const wf = readFileSync(".github/workflows/backup.yml", "utf8");
  assert.match(wf, /schedule:/);
  assert.match(wf, /db-backup\.mjs drill --encrypt/);
  assert.match(wf, /path: encrypted\/\*\.json\.enc/);
  assert.doesNotMatch(wf, /path: .*backups\//);
  assert.match(wf, /failure\(\)[\s\S]*--label backup/);
  assert.match(wf, /::error::No backup taken[^\n]*\n\s*exit 1/);
  assert.doesNotMatch(wf, /if: failure\(\) && steps\.gate/, "missing secrets open the issue too");
});
