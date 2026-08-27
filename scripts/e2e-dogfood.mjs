#!/usr/bin/env node
/**
 * Dogfood the Orvius wedge loop without a live phone call:
 * demo call → simulated Vapi end-of-call → simulated Twilio SMS → dashboard verify
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env");
const prisma = new PrismaClient();

const TEST_INBOUND = "+15559876543";
const TEST_OWNER = "+15551112222";
const TEST_SMS_FROM = "+15551234567";

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

async function check(name, fn) {
  try {
    const result = await fn();
    const ok = result.ok !== false;
    console.log(`${ok ? "✅" : "❌"} ${name}: ${result.message}`);
    return ok;
  } catch (err) {
    console.log(`❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function main() {
  const env = loadEnv();
  let appUrl = (
    process.env.E2E_BASE_URL ??
    env.NEXT_PUBLIC_APP_URL ??
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");

  // Prefer local server when production URL is not reachable (pre-DNS)
  if (!appUrl.includes("localhost") && !appUrl.includes("127.0.0.1")) {
    try {
      const probe = await fetch(`${appUrl}/api/health`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!probe.ok) throw new Error("unreachable");
    } catch {
      appUrl = "http://127.0.0.1:3000";
    }
  }

  console.log("\n🧪 Orvius E2E dogfood\n");
  console.log(`   App URL: ${appUrl}\n`);

  const results = [];

  results.push(
    await check("Health endpoint", async () => {
      const res = await fetch(`${appUrl}/api/health`);
      const data = await res.json();
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      return {
        ok: true,
        message: `configured=${data.configured}, businesses=${data.stats.businessCount}`,
      };
    }),
  );

  results.push(
    await check("Demo call → lead", async () => {
      const res = await fetch(`${appUrl}/api/demo/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callerName: "E2E Test Caller",
          callerPhone: "+15125550999",
          serviceType: "Water heater estimate",
          urgency: "this-week",
          address: "900 Test Lane, Austin TX",
          notes: "Automated dogfood test",
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, message: data.error ?? res.status };
      return {
        ok: true,
        message: `lead ${data.leadId} for ${data.business.name}`,
      };
    }),
  );

  const business = await prisma.business.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!business) {
    console.log("❌ No business in database — run /admin or npm run onboard");
    process.exit(1);
  }

  await prisma.business.update({
    where: { id: business.id },
    data: {
      twilioPhone: TEST_INBOUND,
      vapiPhoneNumber: TEST_INBOUND,
      ownerPhone: business.ownerPhone ?? TEST_OWNER,
    },
  });

  const vapiCallId = `e2e_${Date.now()}`;

  results.push(
    await check("Vapi call-started webhook", async () => {
      const res = await fetch(`${appUrl}/api/webhooks/vapi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.VAPI_WEBHOOK_SECRET
            ? { "x-vapi-secret": env.VAPI_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify({
          message: {
            type: "call-started",
            call: {
              id: vapiCallId,
              customer: { number: TEST_SMS_FROM },
              phoneNumber: { number: TEST_INBOUND },
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, message: JSON.stringify(data) };
      return { ok: true, message: "call record created" };
    }),
  );

  results.push(
    await check("Vapi end-of-call → lead + owner notify", async () => {
      const res = await fetch(`${appUrl}/api/webhooks/vapi`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.VAPI_WEBHOOK_SECRET
            ? { "x-vapi-secret": env.VAPI_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify({
          message: {
            type: "end-of-call-report",
            call: {
              id: vapiCallId,
              customer: { number: TEST_SMS_FROM },
              phoneNumber: { number: TEST_INBOUND },
            },
            summary:
              "Caller needs emergency AC repair. Name: James Carter. Address captured.",
            durationSeconds: 142,
            analysis: {
              structuredData: {
                name: "James Carter",
                phone: TEST_SMS_FROM,
                serviceType: "AC not cooling",
                urgency: "emergency",
                address: "4412 Lakeview Dr, Austin TX",
              },
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, message: JSON.stringify(data) };
      return {
        ok: true,
        message: `lead ${data.leadId ?? "created"}`,
      };
    }),
  );

  results.push(
    await check("Twilio SMS webhook → lead", async () => {
      const form = new URLSearchParams();
      form.set("From", TEST_SMS_FROM);
      form.set("To", TEST_INBOUND);
      form.set("Body", "Hi, my AC stopped working. Can someone come today?");

      const res = await fetch(`${appUrl}/api/webhooks/twilio/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await res.text();
      if (!res.ok || !text.includes("<Response>")) {
        return { ok: false, message: text.slice(0, 120) };
      }
      return { ok: true, message: "SMS lead + TwiML reply" };
    }),
  );

  results.push(
    await check("Dashboard reflects activity", async () => {
      const res = await fetch(`${appUrl}/api/dashboard`);
      const data = await res.json();
      if (!res.ok) return { ok: false, message: "dashboard fetch failed" };
      const ok =
        data.callCount >= 2 && data.leadCount >= 3 && data.businessCount >= 1;
      return {
        ok,
        message: `calls=${data.callCount}, leads=${data.leadCount}, businesses=${data.businessCount}`,
      };
    }),
  );

  const liveCreds =
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_PHONE_NUMBER &&
    env.VAPI_API_KEY;

  console.log(
    liveCreds
      ? "\n🔑 Live credentials present — run: npm run onboard"
      : "\n⚠️  Live credentials missing — add Twilio + Vapi secrets, then: npm run onboard",
  );

  console.log(
    results.every(Boolean)
      ? "\n✅ Internal wedge loop passed.\n"
      : "\n❌ Some checks failed — see docs/FAILURE-LOG.md\n",
  );

  await prisma.$disconnect();
  process.exit(results.every(Boolean) ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
