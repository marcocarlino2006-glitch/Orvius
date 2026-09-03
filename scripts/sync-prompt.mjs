#!/usr/bin/env node
/**
 * Push the latest Orvius receptionist prompt to the live Vapi assistant.
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

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatHoursForPrompt(hoursJson) {
  const hours = parseJson(hoursJson, {});
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  return days
    .map((day) => {
      const entry = hours[day];
      if (!entry || entry.closed) return `${day}: closed`;
      return `${day}: ${entry.open} - ${entry.close}`;
    })
    .join("\n");
}

function formatServicesForPrompt(servicesJson) {
  const services = parseJson(servicesJson, []);
  if (!services.length) return "- General service calls and estimates";
  return services
    .map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ""}`)
    .join("\n");
}

function buildAssistantSystemPrompt(business) {
  const greeting =
    business.greeting ??
    `Thank you for calling ${business.name}. How can I help you today?`;

  return `You are the AI receptionist for ${business.name}, a trusted local home services company serving homeowners with HVAC, plumbing, and electrical work.

VOICE & TONE
- Warm, calm, professional — like the best dispatcher in town.
- Short sentences. One question at a time. Never ramble.
- Never say you are an AI unless directly asked. If asked, say: "I'm the virtual receptionist for ${business.name}, and I can help get a technician scheduled or take your info for a callback."
- Never dead air. If thinking, say "One moment" or "Got it."

YOUR JOB (in order)
1. Greet using the opening line below.
2. Understand what they need: service type (AC, heat, plumbing leak, electrical, etc.).
3. Assess urgency: emergency (no heat/AC in extreme weather, active leak, no power, gas smell → treat as emergency), same-day, this week, or flexible.
4. Collect: full service address, caller name, callback number (repeat it back to confirm).
5. If they want to schedule: preferred day/time window. Say we'll confirm by text or callback.
6. Close: "I've got everything. A technician will follow up shortly" or equivalent.

RULES
- NEVER invent pricing, arrival times, or technician names.
- NEVER promise a specific arrival time — say "we'll call to confirm" or "dispatch will follow up."
- If caller asks for a person: "I can have the owner call you back within 15 minutes. What's the best number?"
- If caller is vague: ask one clarifying question, not three at once.
- If spam/sales/robo: politely end — "We're not interested, thank you."
- Gas smell or immediate danger: tell them to leave the area and call 911 if needed, then capture info for follow-up.

OPENING LINE
"${greeting}"

BUSINESS HOURS
${formatHoursForPrompt(business.hoursJson)}

After hours: still take the message and mark urgency. Emergency calls get priority callback.

SERVICES
${formatServicesForPrompt(business.servicesJson)}

BEFORE ENDING EVERY CALL
Confirm: name, callback number (read it back), service needed, urgency, address.
Mark urgency as: emergency | same-day | this-week | flexible`;
}

async function main() {
  const env = loadEnv();
  const apiKey = env.VAPI_API_KEY;
  if (!apiKey) {
    console.error("Missing VAPI_API_KEY");
    process.exit(1);
  }

  const business = await prisma.business.findFirst({
    where: { vapiAssistantId: { not: null } },
    orderBy: { createdAt: "asc" },
  });

  if (!business?.vapiAssistantId) {
    console.error("No Vapi assistant — run npm run onboard");
    process.exit(1);
  }

  const systemPrompt = buildAssistantSystemPrompt(business);
  const greeting =
    business.greeting ??
    `Thank you for calling ${business.name}. How can I help you today?`;

  const webhookBase = (
    process.env.WEBHOOK_BASE_URL ??
    env.NEXT_PUBLIC_APP_URL ??
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");

  const payload = {
    name: `${business.name} Receptionist`,
    firstMessage: greeting,
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }],
    },
    serverUrl: `${webhookBase}/api/webhooks/vapi`,
    ...(env.VAPI_WEBHOOK_SECRET
      ? { serverUrlSecret: env.VAPI_WEBHOOK_SECRET }
      : {}),
    analysisPlan: {
      summaryPlan: { enabled: true },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Caller's full name" },
            phone: {
              type: "string",
              description: "Callback phone in E.164",
            },
            email: { type: "string" },
            serviceType: { type: "string" },
            urgency: {
              type: "string",
              enum: ["emergency", "same-day", "this-week", "flexible"],
            },
            address: { type: "string" },
            notes: { type: "string" },
          },
        },
      },
    },
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
    console.error("Vapi PATCH failed:", res.status, await res.text());
    process.exit(1);
  }

  console.log("\n✅ Receptionist prompt synced to Vapi");
  console.log(`   Business: ${business.name}`);
  console.log(`   Assistant: ${business.vapiAssistantId}`);
  console.log(`   Webhook: ${webhookBase}/api/webhooks/vapi\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
