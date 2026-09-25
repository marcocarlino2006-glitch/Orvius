#!/usr/bin/env node
/**
 * Database backup and restore drill.
 *
 *   node scripts/db-backup.mjs backup  [--out backups/orvius-<time>.json]
 *   node scripts/db-backup.mjs restore-drill <backup.json>
 *   node scripts/db-backup.mjs drill                        # backup, then drill it
 *
 * `backup` writes every table's schema and rows from DATABASE_URL (local
 * SQLite or Turso) to one JSON file. `restore-drill` rebuilds that file into a
 * fresh temporary SQLite database and checks every table's row count matches —
 * a backup nobody has restored is a hope, not a backup.
 *
 * Backups hold customer names, phone numbers, and addresses. Keep them off
 * GitHub (backups/ is gitignored) and out of CI artifacts; store them where
 * you would store the database itself. On Turso, point-in-time restore is the
 * first line of recovery; this is the copy you control.
 */
import { createClient } from "@libsql/client";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./lib/db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function resolveDatabaseUrl(raw) {
  const url = raw?.trim() ?? "";
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("libsql://")) {
    const parsed = new URL(url);
    const authToken = parsed.searchParams.get("authToken") ?? process.env.TURSO_AUTH_TOKEN?.trim();
    parsed.searchParams.delete("authToken");
    return { url: parsed.toString(), authToken };
  }
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    // Prisma resolves relative SQLite paths from prisma/, not the repo root.
    return { url: `file:${path.startsWith("/") ? path : join(ROOT, "prisma", path)}` };
  }
  throw new Error(`Unsupported DATABASE_URL scheme: ${url.split(":")[0]}`);
}

export async function listTables(db) {
  const res = await db.execute(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%' ORDER BY name",
  );
  return res.rows.map((r) => ({ name: String(r.name), sql: String(r.sql) }));
}

const quote = (id) => `"${id.replaceAll('"', '""')}"`;

function toJsonValue(v) {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return { $bytes: Buffer.from(v).toString("base64") };
  return v;
}

function fromJsonValue(v) {
  if (v && typeof v === "object" && "$bytes" in v) return Buffer.from(v.$bytes, "base64");
  return v;
}

export async function backup(db) {
  const tables = await listTables(db);
  const indexes = await db.execute("SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL");
  const out = { format: "orvius-backup/1", at: new Date().toISOString(), tables: [], indexes: indexes.rows.map((r) => String(r.sql)) };
  for (const t of tables) {
    const res = await db.execute(`SELECT * FROM ${quote(t.name)}`);
    out.tables.push({
      name: t.name,
      sql: t.sql,
      columns: res.columns,
      rows: res.rows.map((row) => res.columns.map((c) => toJsonValue(row[c]))),
    });
  }
  return out;
}

export async function restoreInto(db, dump) {
  await db.execute("PRAGMA foreign_keys = OFF");
  for (const t of dump.tables) {
    await db.execute(t.sql);
    if (t.rows.length === 0) continue;
    const insert = `INSERT INTO ${quote(t.name)} (${t.columns.map(quote).join(", ")}) VALUES (${t.columns.map(() => "?").join(", ")})`;
    for (let i = 0; i < t.rows.length; i += 200) {
      await db.batch(
        t.rows.slice(i, i + 200).map((row) => ({ sql: insert, args: row.map(fromJsonValue) })),
        "write",
      );
    }
  }
  for (const sql of dump.indexes ?? []) await db.execute(sql);
}

export async function compareCounts(db, dump) {
  const mismatches = [];
  for (const t of dump.tables) {
    const res = await db.execute(`SELECT COUNT(*) AS n FROM ${quote(t.name)}`);
    const restored = Number(res.rows[0].n);
    if (restored !== t.rows.length) mismatches.push({ table: t.name, expected: t.rows.length, restored });
  }
  return mismatches;
}

export async function restoreDrill(dump) {
  const dir = mkdtempSync(join(tmpdir(), "orvius-restore-"));
  const db = createClient({ url: `file:${join(dir, "restore.db")}` });
  try {
    await restoreInto(db, dump);
    const mismatches = await compareCounts(db, dump);
    return { tables: dump.tables.length, rows: dump.tables.reduce((n, t) => n + t.rows.length, 0), mismatches };
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  loadEnvFile();
  const [cmd = "drill", file] = process.argv.slice(2);
  const outArg = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;

  let dump;
  if (cmd === "restore-drill") {
    if (!file) throw new Error("Usage: db-backup.mjs restore-drill <backup.json>");
    dump = JSON.parse(readFileSync(file, "utf8"));
  } else if (cmd === "backup" || cmd === "drill") {
    const db = createClient(resolveDatabaseUrl(process.env.DATABASE_URL));
    const started = Date.now();
    dump = await backup(db);
    db.close();
    const out = outArg ?? join(ROOT, "backups", `orvius-${dump.at.replace(/[:.]/g, "-")}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(dump), { mode: 0o600 });
    const rows = dump.tables.reduce((n, t) => n + t.rows.length, 0);
    console.log(`💾 Backed up ${dump.tables.length} tables, ${rows} rows in ${Date.now() - started}ms → ${out}`);
    if (cmd === "backup") return;
  } else {
    throw new Error(`Unknown command: ${cmd}`);
  }

  const started = Date.now();
  const result = await restoreDrill(dump);
  if (result.mismatches.length) {
    console.log(`❌ Restore drill: ${result.mismatches.length} tables came back with the wrong row count`);
    for (const m of result.mismatches) console.log(`   ${m.table}: expected ${m.expected}, restored ${m.restored}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ Restore drill: ${result.tables} tables, ${result.rows} rows restored into a fresh database in ${Date.now() - started}ms; every count matches`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
