#!/usr/bin/env node
/**
 * Master the wedge — restore phones, sync prompt, wire webhooks, run drills.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const tunnelLog = "/tmp/orvius-tunnel.log";

function run(label, cmd, args, extraEnv = {}) {
  console.log(`\n▶ ${label}\n`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    console.error(`\n❌ Failed: ${label}\n`);
    process.exit(result.status ?? 1);
  }
}

function getTunnelUrl() {
  if (!existsSync(tunnelLog)) return null;
  const match = readFileSync(tunnelLog, "utf8").match(
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com/,
  );
  return match?.[0] ?? null;
}

console.log("\n═══════════════════════════════════════");
console.log("  ORVIUS — MASTER THE WEDGE");
console.log("═══════════════════════════════════════\n");

run("Setup check", "npm", ["run", "setup:check"]);
run("Restore live phone numbers", "node", ["scripts/restore-live-phones.mjs"]);

const tunnel = getTunnelUrl();
const webhookBase = process.env.WEBHOOK_BASE_URL ?? tunnel;

if (webhookBase) {
  console.log(`\n🌐 Public webhook base: ${webhookBase}\n`);
  run("Sync receptionist prompt to Vapi", "node", ["scripts/sync-prompt.mjs"], {
    WEBHOOK_BASE_URL: webhookBase,
  });
  run("Configure Vapi webhook", "node", [
    "scripts/configure-vapi-webhook.mjs",
    webhookBase,
  ]);
  run("Attach Twilio number in Vapi", "node", ["scripts/import-vapi-phone.mjs"]);
} else {
  console.log(
    "\n⚠️  No public URL — start tunnel for live phone calls:\n",
  );
  console.log(
    "   npx cloudflared tunnel --url http://127.0.0.1:3000 2>&1 | tee /tmp/orvius-tunnel.log\n",
  );
  run("Sync prompt (local webhook URL)", "node", ["scripts/sync-prompt.mjs"]);
}

run("E2E dogfood", "npm", ["run", "e2e:dogfood"], {
  E2E_BASE_URL: process.env.APP_URL ?? "http://127.0.0.1:3001",
});
run("Wedge drill (edge cases)", "node", ["scripts/wedge-drill.mjs"], {
  APP_URL: process.env.APP_URL ?? "http://127.0.0.1:3001",
});

console.log("\n═══════════════════════════════════════");
console.log("  WEDGE LOOP READY FOR FOUNDER CALL");
console.log("═══════════════════════════════════════\n");
console.log("📱 Call your live line and complete a qualification.");
console.log("📊 Verify lead at /dashboard");
console.log("💬 Confirm owner SMS within 30 seconds");
console.log("\nSee docs/WEDGE-MASTERY.md for the full drill checklist.\n");
