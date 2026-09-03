#!/usr/bin/env node
/**
 * Import Twilio number into Vapi and attach to Orvius assistant.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createScriptPrisma } from "./lib/db.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
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

async function vapiFetch(apiKey, path, options = {}) {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const env = loadEnv();
  const apiKey = env.VAPI_API_KEY;
  const number = env.TWILIO_PHONE_NUMBER;
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;

  if (!apiKey || !number || !sid || !token) {
    console.error("Missing VAPI_API_KEY or Twilio credentials in .env");
    process.exit(1);
  }

  const business = await prisma.business.findFirst({
    where: { vapiAssistantId: { not: null } },
    orderBy: { createdAt: "desc" },
  });

  if (!business?.vapiAssistantId) {
    console.error("No Vapi assistant — run npm run onboard first");
    process.exit(1);
  }

  console.log("\n📞 Importing Twilio number into Vapi\n");
  console.log(`   Number: ${number}`);
  console.log(`   Assistant: ${business.vapiAssistantId}\n`);

  const list = await vapiFetch(apiKey, "/phone-number?limit=100");
  if (list.ok && Array.isArray(list.data)) {
    const existing = list.data.find(
      (p) => p.number === number || p.number?.replace(/\s/g, "") === number,
    );
    if (existing?.id) {
      console.log(`ℹ️  Number already in Vapi (${existing.id}) — updating assistant`);
      const patch = await vapiFetch(apiKey, `/phone-number/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assistantId: business.vapiAssistantId }),
      });
      if (!patch.ok) {
        console.error("PATCH failed:", patch.status, patch.data);
        process.exit(1);
      }
      console.log("✅ Assistant attached to existing Vapi phone number");
      await prisma.business.update({
        where: { id: business.id },
        data: { vapiPhoneNumber: number, twilioPhone: number },
      });
      await prisma.$disconnect();
      return;
    }
  }

  const create = await vapiFetch(apiKey, "/phone-number", {
    method: "POST",
    body: JSON.stringify({
      provider: "twilio",
      number,
      twilioAccountSid: sid,
      twilioAuthToken: token,
      assistantId: business.vapiAssistantId,
      name: `${business.name} line`,
      smsEnabled: false,
    }),
  });

  if (!create.ok) {
    console.error("Import failed:", create.status, JSON.stringify(create.data, null, 2));
    process.exit(1);
  }

  console.log("✅ Twilio number imported and attached");
  console.log(`   Vapi phone ID: ${create.data.id}`);

  await prisma.business.update({
    where: { id: business.id },
    data: { vapiPhoneNumber: number, twilioPhone: number },
  });

  console.log("\n📱 Call your number to test:", number);
  console.log("📊 Check leads at /dashboard\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
