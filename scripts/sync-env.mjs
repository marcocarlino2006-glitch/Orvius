#!/usr/bin/env node
/**
 * Sync secrets from process environment into .env (when injected by Cursor/cloud).
 * Run automatically before onboard.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const examplePath = resolve(__dirname, "../.env.example");

const KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "VAPI_API_KEY",
  "VAPI_WEBHOOK_SECRET",
  "ORVIUS_ADMIN_KEY",
  "ORVIUS_BUSINESS_NAME",
  "ORVIUS_OWNER_PHONE",
  "ORVIUS_OWNER_EMAIL",
  "ENABLE_OWNER_SMS",
];

function loadExisting(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
  }
  return env;
}

function main() {
  const template = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : readFileSync(examplePath, "utf8");

  const existing = loadExisting(envPath);
  let updated = 0;

  for (const key of KEYS) {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess && fromProcess !== existing[key]) {
      existing[key] = fromProcess;
      updated++;
    }
  }

  let output = template;
  for (const [key, value] of Object.entries(existing)) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}="${value}"`;
    if (pattern.test(output)) {
      output = output.replace(pattern, line);
    } else {
      output += `\n${line}`;
    }
  }

  writeFileSync(envPath, output);
  console.log(`Synced ${updated} secret(s) into .env`);
}

main();
