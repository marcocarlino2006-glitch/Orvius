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

/**
 * Split the file into statements, ignoring semicolons that do not end one.
 *
 * This used to be `sql.split(";")`, which is a grenade with the pin out. A
 * prose semicolon inside a `--` comment — "on a shop's first ever load; two
 * fixture shops carry three" — cut a statement in half and sent the second
 * half, bare English, to the database as SQL. It came back `near "two":
 * syntax error`, which is not one of the tolerated messages below, so the
 * migration threw and the deploy failed.
 *
 * The reason that cost real time to find is the skip above: every local and
 * preview build points at file-backed SQLite and returns before reading this
 * file at all. So the SQL was unparsed everywhere except production, and the
 * only symptom was a red deploy with a green local build.
 *
 * Comments are therefore stripped before splitting, and a semicolon inside a
 * string literal is not treated as a terminator either.
 */
export function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inString = false;
  let inComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inComment) {
      if (char === "\n") {
        inComment = false;
        current += char;
      }
      continue;
    }

    if (inString) {
      current += char;
      if (char === "'") {
        // '' is an escaped quote inside a literal, not the end of one.
        if (next === "'") {
          current += next;
          i += 1;
        } else {
          inString = false;
        }
      }
      continue;
    }

    if (char === "-" && next === "-") {
      inComment = true;
      i += 1;
      continue;
    }
    if (char === "'") {
      inString = true;
      current += char;
      continue;
    }
    if (char === ";") {
      statements.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  statements.push(current);
  return statements.map((s) => s.trim()).filter(Boolean);
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

  for (const statement of splitStatements(sql)) {
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

/*
  Only when run as a command. The statement splitter is imported by the test
  beside this file, and importing a module should never be what applies a
  migration to production.
*/
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
