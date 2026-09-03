#!/usr/bin/env node
/**
 * Point the Orvius Vapi assistant at a public webhook URL (tunnel or production).
 *
 * Usage:
 *   node scripts/configure-vapi-webhook.mjs https://YOUR.trycloudflare.com
 *   WEBHOOK_BASE_URL=https://api.orvius.im node scripts/configure-vapi-webhook.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createScriptPrisma } from "./lib/db.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");
const prisma = createScriptPrisma();

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed
      .slice(eq + 1)
      .replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const base = (
    process.argv[2] ??
    process.env.WEBHOOK_BASE_URL ??
    env.NEXT_PUBLIC_APP_URL
  )?.replace(/\/$/, "");

  if (!base) {
    console.error("Usage: node scripts/configure-vapi-webhook.mjs <public-base-url>");
    process.exit(1);
  }

  const apiKey = env.VAPI_API_KEY;
  if (!apiKey) {
    console.error("Missing VAPI_API_KEY in .env");
    process.exit(1);
  }

  const business = await prisma.business.findFirst({
    where: { vapiAssistantId: { not: null } },
    orderBy: { createdAt: "desc" },
  });

  if (!business?.vapiAssistantId) {
    console.error("No business with vapiAssistantId — run npm run onboard first");
    process.exit(1);
  }

  const webhookUrl = `${base}/api/webhooks/vapi`;
  const secret = env.VAPI_WEBHOOK_SECRET;

  const payload = {
    serverUrl: webhookUrl,
    ...(secret ? { serverUrlSecret: secret } : {}),
  };

  const res = await fetch(
    `https://api.vapi.ai/assistant/${business.vapiAssistantId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    console.error("Vapi update failed:", res.status, await res.text());
    process.exit(1);
  }

  console.log("\n✅ Vapi assistant updated");
  console.log(`   Business: ${business.name}`);
  console.log(`   Assistant: ${business.vapiAssistantId}`);
  console.log(`   Webhook: ${webhookUrl}`);
  if (secret) console.log(`   Secret: ${secret}`);
  console.log(`\n📱 SMS webhook (Twilio console): ${base}/api/webhooks/twilio/sms`);
  console.log("\nNext: attach +18446439170 to this assistant in Vapi → Phone Numbers\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
