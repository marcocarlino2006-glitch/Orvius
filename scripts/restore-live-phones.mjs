#!/usr/bin/env node
/**
 * Restore primary shop phones from .env after e2e mutations.
 * One number → one shop: clears the live line from every other active shop.
 */
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();
const prisma = createScriptPrisma();

function normalizePhone(phone) {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 7 ? digits : null;
}

async function main() {
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!twilioPhone) {
    console.error("Missing TWILIO_PHONE_NUMBER in .env");
    process.exit(1);
  }

  const business = await prisma.business.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!business) {
    console.error("No business found");
    process.exit(1);
  }

  const ownerPhone =
    process.env.ORVIUS_OWNER_PHONE?.trim() ?? business.ownerPhone;

  if (!ownerPhone) {
    console.error(
      "Set ORVIUS_OWNER_PHONE in .env to your cell (not the Twilio line)",
    );
    process.exit(1);
  }

  if (normalizePhone(ownerPhone) === normalizePhone(twilioPhone)) {
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

  const line = normalizePhone(twilioPhone) ?? twilioPhone;
  const cleared = await prisma.business.updateMany({
    where: {
      isActive: true,
      id: { not: business.id },
      OR: [{ twilioPhone: line }, { vapiPhoneNumber: line }, { twilioPhone }, { vapiPhoneNumber: twilioPhone }],
    },
    data: {
      twilioPhone: null,
      vapiPhoneNumber: null,
    },
  });

  console.log("\n✅ Live phones restored");
  console.log(`   Business: ${business.name}`);
  console.log(`   Twilio/Vapi line: ${twilioPhone}`);
  console.log(`   Owner SMS: ${ownerPhone}`);
  console.log(`   Cleared shared line from ${cleared.count} other shop(s)\n`);
}

main()
  .catch(async (err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
