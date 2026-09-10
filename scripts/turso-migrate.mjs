#!/usr/bin/env node
/**
 * Apply incremental Turso migrations (ALTER TABLE / new tables).
 *
 * This runs in the Vercel build, because there is no migrations directory and
 * `prisma generate` does not touch the database. Without it, a deploy ships
 * code that selects columns the production database has never been given —
 * the dashboard 500s and passwordless sign-in fails outright, since
 * `LoginToken` would not exist at all.
 *
 * Every statement in the SQL file is idempotent, so running it on each build
 * is safe and a re-deploy is a no-op.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/**
 * Prefer the injected environment, which is the only one that exists on
 * Vercel; fall back to the local .env file so running this by hand still works.
 */
function loadDatabaseUrl() {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;

  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return null;
  const raw = readFileSync(envPath, "utf8");
  const match = raw.match(/^DATABASE_URL="?([^"\n]+)"?/m);
  return match ? match[1] : null;
}

async function main() {
  const databaseUrl = loadDatabaseUrl();

  /*
    Skip only where skipping is correct, and say which case applied.

    A local or preview build points at file-backed SQLite, which `prisma db
    push` owns — migrating it here would be wrong, not merely unnecessary. Any
    remote libsql URL is production data, so from that point on a failure is a
    real failure and must stop the build rather than deploy code against a
    schema that cannot serve it.
  */
  if (!databaseUrl) {
    console.log("↷ turso-migrate: no DATABASE_URL — skipping");
    return;
  }
  if (!/^(libsql|wss|https):/.test(databaseUrl)) {
    console.log("↷ turso-migrate: DATABASE_URL is not a Turso URL — skipping");
    return;
  }

  const parsed = new URL(databaseUrl);
  const authToken = parsed.searchParams.get("authToken") ?? process.env.TURSO_AUTH_TOKEN?.trim();
  if (!authToken) throw new Error("Turso DATABASE_URL needs ?authToken=… or TURSO_AUTH_TOKEN");
  parsed.searchParams.delete("authToken");

  const sql = readFileSync(resolve(root, "prisma/turso-migrate.sql"), "utf8");
  const client = createClient({ url: parsed.toString(), authToken });

  for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
    try {
      await client.execute(statement);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("duplicate column") || msg.includes("already exists")) {
        continue;
      }
      throw error;
    }
  }

  console.log("✅ Turso migrations applied");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
