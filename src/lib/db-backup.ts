import { createClient, type Client } from "@libsql/client";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

/*
  The server half of the nightly backup (same file format as scripts/db-backup.mjs).
  Vercel already holds the database credentials, so the backup is taken here and
  only the encrypted file ever leaves: GitHub stores it without being able to read it.
*/

const MAGIC = Buffer.from("ORVB1");

/**
 * BACKUP_ENCRYPTION_KEY when set. Otherwise derived from AUTH_SECRET, which only
 * Vercel holds, and CRON_SECRET, so neither GitHub nor Vercel alone is enough
 * once a file is downloaded. scripts/db-backup.mjs derives the same key.
 */
export function backupPassphrase(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.BACKUP_ENCRYPTION_KEY?.trim();
  if (explicit) return explicit.length >= 32 ? explicit : null;
  const auth = env.AUTH_SECRET?.trim();
  const cron = env.CRON_SECRET?.trim();
  if (!auth || !cron) return null;
  return createHash("sha256").update(`orvius-backup/1\n${auth}\n${cron}`).digest("hex");
}

function keyFor(passphrase: string, salt: Buffer) {
  return scryptSync(passphrase, salt, 32);
}

export function encryptDump(dump: unknown, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(gzipSync(JSON.stringify(dump))), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decryptDump(buf: Buffer, passphrase: string): BackupDump {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not an encrypted Orvius backup");
  let o = MAGIC.length;
  const salt = buf.subarray(o, (o += 16));
  const iv = buf.subarray(o, (o += 12));
  const tag = buf.subarray(o, (o += 16));
  const decipher = createDecipheriv("aes-256-gcm", keyFor(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(gunzipSync(Buffer.concat([decipher.update(buf.subarray(o)), decipher.final()])).toString("utf8"));
}

export type BackupDump = {
  format: "orvius-backup/1";
  at: string;
  tables: { name: string; sql: string; columns: string[]; rows: unknown[][] }[];
  indexes: string[];
};

export function databaseClient(raw = process.env.DATABASE_URL): Client {
  const url = raw?.trim() ?? "";
  if (url.startsWith("libsql://")) {
    const parsed = new URL(url);
    const authToken = parsed.searchParams.get("authToken") ?? process.env.TURSO_AUTH_TOKEN?.trim();
    parsed.searchParams.delete("authToken");
    return createClient({ url: parsed.toString(), authToken });
  }
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    return createClient({ url: `file:${path.startsWith("/") ? path : join(process.cwd(), "prisma", path)}` });
  }
  throw new Error("DATABASE_URL is not a libsql or file URL");
}

const quote = (id: string) => `"${id.replaceAll('"', '""')}"`;

function toJsonValue(v: unknown) {
  if (typeof v === "bigint") return Number(v);
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return { $bytes: Buffer.from(v as ArrayBuffer).toString("base64") };
  return v;
}

function fromJsonValue(v: unknown) {
  if (v && typeof v === "object" && "$bytes" in v) return Buffer.from(String((v as { $bytes: string }).$bytes), "base64");
  return v;
}

export async function takeBackup(db: Client): Promise<BackupDump> {
  const tables = await db.execute(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%' ORDER BY name",
  );
  const indexes = await db.execute("SELECT sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL");
  const out: BackupDump = { format: "orvius-backup/1", at: new Date().toISOString(), tables: [], indexes: indexes.rows.map((r) => String(r.sql)) };
  for (const t of tables.rows) {
    const name = String(t.name);
    const res = await db.execute(`SELECT * FROM ${quote(name)}`);
    out.tables.push({
      name,
      sql: String(t.sql),
      columns: res.columns,
      rows: res.rows.map((row) => res.columns.map((c) => toJsonValue(row[c]))),
    });
  }
  return out;
}

/** Rebuild a dump into a fresh database and compare every table's row count. */
export async function restoreDrill(dump: BackupDump) {
  const dir = mkdtempSync(join(tmpdir(), "orvius-restore-"));
  const db = createClient({ url: `file:${join(dir, "restore.db")}` });
  try {
    await db.execute("PRAGMA foreign_keys = OFF");
    for (const t of dump.tables) {
      await db.execute(t.sql);
      if (!t.rows.length) continue;
      const insert = `INSERT INTO ${quote(t.name)} (${t.columns.map(quote).join(", ")}) VALUES (${t.columns.map(() => "?").join(", ")})`;
      for (let i = 0; i < t.rows.length; i += 200) {
        await db.batch(
          t.rows.slice(i, i + 200).map((row) => ({ sql: insert, args: row.map(fromJsonValue) as never[] })),
          "write",
        );
      }
    }
    for (const sql of dump.indexes ?? []) await db.execute(sql);
    const mismatches: { table: string; expected: number; restored: number }[] = [];
    for (const t of dump.tables) {
      const res = await db.execute(`SELECT COUNT(*) AS n FROM ${quote(t.name)}`);
      const restored = Number(res.rows[0].n);
      if (restored !== t.rows.length) mismatches.push({ table: t.name, expected: t.rows.length, restored });
    }
    return { tables: dump.tables.length, rows: dump.tables.reduce((n, t) => n + t.rows.length, 0), mismatches };
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
