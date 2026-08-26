#!/usr/bin/env node
/**
 * One-command Orvius onboarding:
 * - sync secrets from environment
 * - verify Twilio + Vapi
 * - create first business + Vapi assistant if none exist
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");

spawnSync("node", ["scripts/sync-env.mjs"], { cwd: root, stdio: "inherit" });

function loadEnv() {
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
    process.env[key] = value;
  }
  return env;
}

const DEFAULT_HOURS = {
  monday: { open: "08:00", close: "18:00" },
  tuesday: { open: "08:00", close: "18:00" },
  wednesday: { open: "08:00", close: "18:00" },
  thursday: { open: "08:00", close: "18:00" },
  friday: { open: "08:00", close: "18:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: { closed: true, open: "00:00", close: "00:00" },
};

const DEFAULT_SERVICES = [
  { name: "Emergency repair", description: "Same-day urgent service" },
  { name: "Estimate / inspection", description: "On-site quote visit" },
  { name: "Maintenance", description: "Scheduled maintenance visit" },
];

async function check(name, fn) {
  const result = await fn();
  console.log(`${result.ok ? "✅" : "❌"} ${name}: ${result.message}`);
  return result.ok;
}

async function main() {
  console.log("\n🚀 Orvius auto-onboard\n");

  if (!existsSync(envPath)) {
    console.error("❌ .env not found");
    process.exit(1);
  }

  const env = loadEnv();
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const checks = await Promise.all([
    check("Twilio", async () => {
      if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
        return { ok: false, message: "Missing Twilio credentials" };
      }
      const auth = Buffer.from(
        `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`,
      ).toString("base64");
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}.json`,
        { headers: { Authorization: `Basic ${auth}` } },
      );
      return res.ok
        ? { ok: true, message: "Connected" }
        : { ok: false, message: `Auth failed (${res.status})` };
    }),
    check("Vapi", async () => {
      if (!env.VAPI_API_KEY) {
        return { ok: false, message: "Missing VAPI_API_KEY" };
      }
      const res = await fetch("https://api.vapi.ai/assistant?limit=1", {
        headers: { Authorization: `Bearer ${env.VAPI_API_KEY}` },
      });
      return res.ok
        ? { ok: true, message: "Connected" }
        : { ok: false, message: `Auth failed (${res.status})` };
    }),
  ]);

  if (!checks.every(Boolean)) {
    console.log(
      "\n⚠️  Add Twilio + Vapi secrets to your environment, then re-run: npm run onboard\n",
    );
    process.exit(1);
  }

  if (!env.ORVIUS_ADMIN_KEY) {
    const key = cryptoRandom();
    const updated = readFileSync(envPath, "utf8").replace(
      /^ORVIUS_ADMIN_KEY=.*$/m,
      `ORVIUS_ADMIN_KEY="${key}"`,
    );
    writeFileSync(
      envPath,
      updated.includes("ORVIUS_ADMIN_KEY=")
        ? updated
        : `${readFileSync(envPath, "utf8")}\nORVIUS_ADMIN_KEY="${key}"\n`,
    );
    env.ORVIUS_ADMIN_KEY = key;
    console.log(`🔐 Generated ORVIUS_ADMIN_KEY`);
  }

  spawnSync("npm", ["run", "db:push"], { cwd: root, stdio: "inherit" });

  const businessName = env.ORVIUS_BUSINESS_NAME ?? "Summit HVAC";
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const listRes = await fetch(`${appUrl}/api/businesses`);
  const businesses = await listRes.json();

  if (Array.isArray(businesses) && businesses.length > 0) {
    const biz = businesses[0];
    console.log("\n✅ Business already exists:");
    console.log(`   Name: ${biz.name}`);
    console.log(`   Assistant: ${biz.vapiAssistantId}`);
    printNextSteps(appUrl, env);
    return;
  }

  const payload = {
    name: businessName,
    slug,
    ownerPhone: env.ORVIUS_OWNER_PHONE ?? env.TWILIO_PHONE_NUMBER,
    ownerEmail: env.ORVIUS_OWNER_EMAIL ?? "",
    twilioPhone: env.TWILIO_PHONE_NUMBER,
    vapiPhoneNumber: env.TWILIO_PHONE_NUMBER,
    greeting: `Thank you for calling ${businessName}. How can I help you today?`,
    hoursJson: JSON.stringify(DEFAULT_HOURS),
    servicesJson: JSON.stringify(DEFAULT_SERVICES),
  };

  const createRes = await fetch(`${appUrl}/api/businesses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.ORVIUS_ADMIN_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const created = await createRes.json();
  if (!createRes.ok) {
    console.error("\n❌ Failed to create business:", created.error ?? created);
    process.exit(1);
  }

  console.log("\n✅ Orvius business provisioned:");
  console.log(`   Name: ${created.name}`);
  console.log(`   Slug: ${created.slug}`);
  console.log(`   Vapi Assistant ID: ${created.vapiAssistantId}`);

  printNextSteps(appUrl, env);
}

function printNextSteps(appUrl, env) {
  console.log("\n📋 Final manual step in Vapi (one time):");
  console.log(`   1. Open https://dashboard.vapi.ai`);
  console.log(`   2. Attach phone ${env.TWILIO_PHONE_NUMBER} to the assistant above`);
  console.log(`   3. Webhook URL: ${appUrl}/api/webhooks/vapi`);
  if (env.VAPI_WEBHOOK_SECRET) {
    console.log(`   4. Webhook secret: ${env.VAPI_WEBHOOK_SECRET}`);
  }
  console.log(`\n📱 Twilio SMS webhook (optional):`);
  console.log(`   ${appUrl}/api/webhooks/twilio/sms`);
  console.log(`\n🌐 Admin: ${appUrl}/admin`);
  console.log(`📊 Dashboard: ${appUrl}/dashboard\n`);
}

function cryptoRandom() {
  return Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
}

main().catch((err) => {
  console.error("Onboard failed:", err);
  process.exit(1);
});
