#!/usr/bin/env node
/**
 * Ensure every customer shop has its own dedicated line (not the marketing demo).
 * Requires the app URL and ADMIN_SECRET (or run against local dev server).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ??
    env.NEXT_PUBLIC_APP_URL ??
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");
  const adminSecret =
    process.env.ADMIN_SECRET ?? env.ADMIN_SECRET ?? env.ORVIUS_ADMIN_SECRET;

  if (!adminSecret) {
    console.error("Missing ADMIN_SECRET in environment");
    process.exit(1);
  }

  console.log(`\n📞 Repairing customer shop lines via ${appUrl}\n`);

  const res = await fetch(`${appUrl}/api/admin/repair-lines`, {
    method: "POST",
    headers: {
      "x-orvius-admin-secret": adminSecret,
    },
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Repair failed:", data.error ?? res.statusText);
    process.exit(1);
  }

  for (const row of data.results ?? []) {
    if (row.error) {
      console.log(`❌ ${row.name}: ${row.error}`);
    } else {
      console.log(`✅ ${row.name}: ${row.line ?? "no line"}`);
    }
  }

  console.log(
    `\nDone — ${data.total - data.failed}/${data.total} shops OK\n`,
  );
  process.exit(data.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
