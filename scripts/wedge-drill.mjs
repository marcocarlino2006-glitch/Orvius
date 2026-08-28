#!/usr/bin/env node
/**
 * Wedge mastery drill — simulate edge-case calls and SMS without a phone.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const prisma = new PrismaClient();

const SCENARIOS = [
  {
    name: "Emergency AC — full qualify",
    structured: {
      name: "Maria Lopez",
      phone: "+15125550123",
      serviceType: "AC not cooling",
      urgency: "emergency",
      address: "1842 Oak Street, Austin TX",
    },
  },
  {
    name: "Plumbing estimate — this week",
    structured: {
      name: "James Carter",
      phone: "+15125550199",
      serviceType: "Water heater estimate",
      urgency: "this-week",
      address: "902 Cedar Ave, Round Rock TX",
    },
  },
  {
    name: "Electrical same-day",
    structured: {
      name: "Priya Patel",
      phone: "+15125550888",
      serviceType: "Breaker keeps tripping",
      urgency: "same-day",
      address: "4412 Lakeview Dr, Austin TX",
    },
  },
  {
    name: "Partial data — callback only",
    structured: {
      phone: "+15125550777",
      serviceType: "General HVAC inquiry",
      urgency: "flexible",
      notes: "Caller hung up before giving address",
    },
  },
];

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

async function runScenario(appUrl, env, business, scenario) {
  const liveLine = env.TWILIO_PHONE_NUMBER ?? business.twilioPhone;
  const vapiCallId = `drill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const headers = {
    "Content-Type": "application/json",
    ...(env.VAPI_WEBHOOK_SECRET
      ? { "x-vapi-secret": env.VAPI_WEBHOOK_SECRET }
      : {}),
  };

  const callPayload = {
    message: {
      type: "call-started",
      call: {
        id: vapiCallId,
        assistantId: business.vapiAssistantId,
        customer: { number: scenario.structured.phone ?? "+15550001111" },
        phoneNumber: { number: liveLine },
      },
    },
  };

  const startRes = await fetch(`${appUrl}/api/webhooks/vapi`, {
    method: "POST",
    headers,
    body: JSON.stringify(callPayload),
  });
  if (!startRes.ok) throw new Error(`call-started failed: ${startRes.status}`);

  const endRes = await fetch(`${appUrl}/api/webhooks/vapi`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: {
        type: "end-of-call-report",
        call: callPayload.message.call,
        summary: `${scenario.name} — automated drill`,
        durationSeconds: 95,
        analysis: { structuredData: scenario.structured },
      },
    }),
  });

  const text = await endRes.text();
  let endData;
  try {
    endData = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${endRes.status}: ${text.slice(0, 120)}`);
  }
  if (!endRes.ok) throw new Error(JSON.stringify(endData));

  return endData.leadId;
}

async function main() {
  const env = loadEnv();
  const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(
    /\/$/,
    "",
  );

  console.log("\n🎯 Orvius wedge mastery drill\n");
  console.log(`   App URL: ${appUrl}\n`);

  const business = await prisma.business.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!business?.vapiAssistantId) {
    console.error("No business — run npm run onboard");
    process.exit(1);
  }

  let passed = 0;
  for (const scenario of SCENARIOS) {
    try {
      const leadId = await runScenario(appUrl, env, business, scenario);
      console.log(`✅ ${scenario.name} → lead ${leadId}`);
      passed++;
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.log(
        `❌ ${scenario.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // SMS path
  try {
    const liveLine = env.TWILIO_PHONE_NUMBER ?? business.twilioPhone;
    const form = new URLSearchParams();
    form.set("From", "+15125551234");
    form.set("To", liveLine);
    form.set("Body", "Drill: AC stopped working, need someone today");

    const res = await fetch(`${appUrl}/api/webhooks/twilio/sms`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const text = await res.text();
    if (!res.ok || !text.includes("<Response>")) throw new Error("SMS failed");
    console.log("✅ Inbound SMS → lead + TwiML reply");
    passed++;
  } catch (err) {
    console.log(
      `❌ Inbound SMS: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  console.log(
    `\n${passed}/${SCENARIOS.length + 1} drill scenarios passed.\n`,
  );

  await prisma.$disconnect();
  process.exit(passed === SCENARIOS.length + 1 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
