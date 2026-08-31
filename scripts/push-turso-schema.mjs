#!/usr/bin/env node
/**
 * Apply Prisma schema to remote Turso (one-time / after schema changes).
 * Usage: npm run db:push:turso
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
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
  if (!databaseUrl.startsWith("libsql://")) {
    console.error("DATABASE_URL must be a libsql:// Turso URL");
    process.exit(1);
  }

  const parsed = new URL(databaseUrl);
  const authToken = parsed.searchParams.get("authToken");
  if (!authToken) {
    console.error("DATABASE_URL must include ?authToken=...");
    process.exit(1);
  }

  parsed.searchParams.delete("authToken");
  const url = parsed.toString();

  const sqlPath = resolve(root, "prisma/turso-schema.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = createClient({ url, authToken });
  await client.executeMultiple(sql);
  console.log("✅ Turso schema applied");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
