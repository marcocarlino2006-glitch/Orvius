#!/usr/bin/env node
/**
 * One command to wire live receptionist (tunnel + Vapi phone + webhook).
 * Requires: .env with Twilio + Vapi, local server on :3000, cloudflared tunnel running.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const tunnelLog = "/tmp/orvius-tunnel.log";

function getTunnelUrl() {
  if (!existsSync(tunnelLog)) return null;
  const match = readFileSync(tunnelLog, "utf8").match(
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com/,
  );
  return match?.[0] ?? null;
}

console.log("\n🚀 Orvius go-live (dev tunnel)\n");

spawnSync("npm", ["run", "setup:check"], { cwd: root, stdio: "inherit" });

const tunnel = getTunnelUrl();
if (!tunnel) {
  console.log(
    "\n⚠️  No tunnel URL in /tmp/orvius-tunnel.log — start cloudflared first:\n",
  );
  console.log("   npx cloudflared tunnel --url http://127.0.0.1:3000\n");
  process.exit(1);
}

console.log(`\n🌐 Tunnel: ${tunnel}\n`);

spawnSync("node", ["scripts/configure-vapi-webhook.mjs", tunnel], {
  cwd: root,
  stdio: "inherit",
});

spawnSync("node", ["scripts/import-vapi-phone.mjs"], {
  cwd: root,
  stdio: "inherit",
});

console.log("\n✅ Live on tunnel. Call your Twilio number to test.");
console.log(`   Dashboard: ${tunnel}/dashboard\n`);
