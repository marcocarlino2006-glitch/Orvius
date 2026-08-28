#!/usr/bin/env node
/**
 * Restore Summit HVAC phone fields from .env after e2e dogfood mutations.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const prisma = new PrismaClient();

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
  const twilioPhone = env.TWILIO_PHONE_NUMBER;
  if (!twilioPhone) {
    console.error("Missing TWILIO_PHONE_NUMBER in .env");
    process.exit(1);
  }

  const business = await prisma.business.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!business) {
    console.error("No business found");
    process.exit(1);
  }

  const ownerPhone = env.ORVIUS_OWNER_PHONE ?? business.ownerPhone;

  if (!ownerPhone) {
    console.error(
      "Set ORVIUS_OWNER_PHONE in .env to your cell (not the Twilio line)",
    );
    process.exit(1);
  }

  if (ownerPhone === twilioPhone) {
    console.warn(
      "\n⚠️  Owner phone equals Twilio line — SMS alerts won't reach your cell.",
    );
    console.warn("   Set ORVIUS_OWNER_PHONE to your personal number in .env\n");
  }

  await prisma.business.update({
    where: { id: business.id },
    data: {
      twilioPhone,
      vapiPhoneNumber: twilioPhone,
      ownerPhone,
    },
  });

  console.log("\n✅ Live phones restored");
  console.log(`   Business: ${business.name}`);
  console.log(`   Twilio/Vapi line: ${twilioPhone}`);
  console.log(`   Owner SMS: ${ownerPhone}\n`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
