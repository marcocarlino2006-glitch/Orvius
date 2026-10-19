#!/usr/bin/env node
/**
 * Compare a database's schema with prisma/schema.prisma without reading a row.
 *
 *   node scripts/release-schema-check.mjs before <plan.sql>   # missing exactly what the plan adds
 *   node scripts/release-schema-check.mjs after               # matches the schema
 *
 * Reads only sqlite_master from DATABASE_URL (Turso or file), rebuilds those
 * definitions in an empty temporary SQLite file, and asks `prisma migrate diff`
 * what it would take to reach prisma/schema.prisma. "before" passes only when
 * that difference is the plan's statements and nothing else, so a production
 * schema that drifted from main stops the release instead of being guessed at.
 * Exit 0 on a match, 1 on a difference, 2 on a usage or connection error.
 */
import { createClient } from "@libsql/client";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATION_LEDGER_TABLE, splitStatements } from "./turso-migrate.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORED = new Set([MIGRATION_LEDGER_TABLE, "_prisma_migrations"]);

export function normalizeStatements(sql) {
  return splitStatements(sql)
    .map((s) => s.replace(/\bIF NOT EXISTS\s+/gi, "").replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim())
    .sort();
}

/** What separates the live schema from the target, against what the plan would add. */
export function compareToPlan(diffSql, planSql) {
  const diff = normalizeStatements(diffSql);
  const plan = planSql ? normalizeStatements(planSql) : [];
  return {
    unexpected: diff.filter((s) => !plan.includes(s)),
    alreadyPresent: plan.filter((s) => !diff.includes(s)),
  };
}

function connect(raw) {
  const url = raw?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");
  if (url.startsWith("file:")) return createClient({ url });
  const parsed = new URL(url);
  const authToken = parsed.searchParams.get("authToken") ?? process.env.TURSO_AUTH_TOKEN?.trim();
  parsed.searchParams.delete("authToken");
  return createClient({ url: parsed.toString(), authToken });
}

async function main() {
  const [mode, planFile] = process.argv.slice(2);
  if (!["before", "after"].includes(mode) || (mode === "before" && !planFile)) {
    console.error("Usage: release-schema-check.mjs before <plan.sql> | after");
    process.exit(2);
  }
  const live = connect(process.env.DATABASE_URL);
  const { rows } = await live.execute(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%' AND name NOT LIKE 'libsql_%'",
  );
  live.close();
  const order = { table: 0, index: 1, view: 2, trigger: 3 };
  const defs = rows
    .filter((r) => !IGNORED.has(String(r.name)) && !String(r.sql).includes(`"${MIGRATION_LEDGER_TABLE}"`))
    .sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));

  const dir = mkdtempSync(join(tmpdir(), "schema-check-"));
  try {
    const copy = createClient({ url: `file:${join(dir, "schema.db")}` });
    for (const r of defs) await copy.execute(String(r.sql));
    copy.close();
    const diffSql = execFileSync(
      "npx",
      ["prisma", "migrate", "diff", "--from-url", `file:${join(dir, "schema.db")}`, "--to-schema-datamodel", join(root, "prisma/schema.prisma"), "--script"],
      { cwd: root, encoding: "utf8", env: { ...process.env, DATABASE_URL: `file:${join(dir, "schema.db")}` } },
    );
    const tables = defs.filter((r) => r.type === "table").length;
    const plan = mode === "before" ? readFileSync(resolve(root, planFile), "utf8") : null;
    const { unexpected, alreadyPresent } = compareToPlan(diffSql, plan);
    console.log(`${mode}: ${tables} tables read from sqlite_master; no rows read`);
    if (alreadyPresent.length) console.log(`already present (the plan skips these):\n  ${alreadyPresent.join("\n  ")}`);
    if (unexpected.length) {
      console.log(`DIFFERENT — ${unexpected.length} statement(s) outside the plan:\n  ${unexpected.join("\n  ")}`);
      process.exit(1);
    }
    console.log(mode === "before" ? "MATCH — the database lacks exactly what the plan adds" : "MATCH — the database has the full schema");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  });
}
