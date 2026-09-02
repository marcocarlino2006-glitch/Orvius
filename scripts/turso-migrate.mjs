#!/usr/bin/env node
/**
 * Apply incremental Turso migrations (ALTER TABLE / new tables).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadDatabaseUrl() {
  const envPath = resolve(root, ".env");
  const raw = readFileSync(envPath, "utf8");
  const match = raw.match(/^DATABASE_URL="([^"]+)"/m);
  if (!match) throw new Error("DATABASE_URL not found in .env");
  return match[1];
}

async function main() {
  const databaseUrl = loadDatabaseUrl();
  const parsed = new URL(databaseUrl);
  const authToken = parsed.searchParams.get("authToken");
  if (!authToken) throw new Error("DATABASE_URL must include ?authToken=...");
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
