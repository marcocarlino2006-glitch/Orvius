import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

function loadEnv() {
  if (!existsSync(envPath)) {
    console.error("❌ .env file not found. Copy .env.example to .env first.");
    process.exit(1);
  }

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
  }
  return env;
}

async function checkTwilio(env) {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const phone = env.TWILIO_PHONE_NUMBER;

  if (!sid || !token) {
    return { ok: false, message: "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN" };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    return { ok: false, message: `Twilio auth failed (${res.status})` };
  }

  const data = await res.json();
  return {
    ok: true,
    message: `Twilio connected — account: ${data.friendly_name ?? sid}${phone ? `, sender: ${phone}` : ""}`,
  };
}

async function checkVapi(env) {
  const key = env.VAPI_API_KEY;
  if (!key) {
    return { ok: false, message: "Missing VAPI_API_KEY" };
  }

  const res = await fetch("https://api.vapi.ai/assistant?limit=1", {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    return { ok: false, message: `Vapi auth failed (${res.status})` };
  }

  return { ok: true, message: "Vapi connected — API key valid" };
}

async function main() {
  console.log("\nOrvius setup check\n");

  const env = loadEnv();
  const checks = [
    { name: "Database", fn: async () => ({ ok: existsSync(resolve(__dirname, "../prisma/dev.db")), message: existsSync(resolve(__dirname, "../prisma/dev.db")) ? "SQLite database exists" : "Run npm run db:push" }) },
    { name: "Twilio", fn: () => checkTwilio(env) },
    { name: "Vapi", fn: () => checkVapi(env) },
    { name: "App URL", fn: async () => {
      const url = env.NEXT_PUBLIC_APP_URL;
      if (!url) return { ok: false, message: "Missing NEXT_PUBLIC_APP_URL" };
      if (url.includes("localhost")) {
        return { ok: true, message: `${url} (use ngrok/cloudflare tunnel for Vapi webhooks in dev)` };
      }
      return { ok: true, message: url };
    }},
  ];

  let allOk = true;
  for (const check of checks) {
    const result = await check.fn();
    const icon = result.ok ? "✅" : "❌";
    console.log(`${icon} ${check.name}: ${result.message}`);
    if (!result.ok) allOk = false;
  }

  console.log(allOk ? "\nAll checks passed. Ready to create businesses at /admin\n" : "\nFix the items above, then re-run: npm run setup:check\n");
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("Setup check failed:", err);
  process.exit(1);
});
