#!/usr/bin/env node
/**
 * Wedge bootstrap — create the Summit dogfood shop shell so wedge:ready
 * can score real gaps instead of dying on "no business."
 *
 * Does NOT buy Twilio/Vapi numbers, does NOT fake lineVerifiedAt,
 * does NOT green founder gates. Next unfinished step stays visible.
 *
 * Usage:
 *   npm run wedge:bootstrap
 *   npm run wedge:bootstrap -- --owner-phone +15551234567 --owner-email you@shop.com
 */
import { createScriptPrisma } from "./lib/db.mjs";

const prisma = createScriptPrisma();

const SLUG = "summit-hvac";
const NAME = "Summit HVAC";

function arg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function normalizePhone(phone) {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.trim().startsWith("+") ? phone.trim() : null;
}

async function main() {
  const ownerPhone =
    normalizePhone(arg("--owner-phone")) ||
    normalizePhone(process.env.FOUNDER_PHONE) ||
    null;
  const ownerEmail =
    (arg("--owner-email") || process.env.FOUNDER_EMAIL || "")
      .trim()
      .toLowerCase() || null;

  let business = await prisma.business.findFirst({
    where: {
      OR: [{ slug: SLUG }, { name: { contains: "Summit" } }],
    },
  });

  if (business) {
    const data = { isActive: true };
    if (ownerPhone && !business.ownerPhone) data.ownerPhone = ownerPhone;
    if (ownerEmail && !business.ownerEmail) data.ownerEmail = ownerEmail;
    if (Object.keys(data).length > 1 || data.isActive !== business.isActive) {
      business = await prisma.business.update({
        where: { id: business.id },
        data,
      });
      console.log(`\n✅ Summit shop found — refreshed (${business.id})\n`);
    } else {
      console.log(`\n✅ Summit shop already present (${business.id})\n`);
    }
  } else {
    business = await prisma.business.create({
      data: {
        name: NAME,
        slug: SLUG,
        isActive: true,
        ownerPhone,
        ownerEmail,
        billingStatus: "pilot",
        billingPlan: null,
        pilotEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        servicesJson: JSON.stringify([
          { name: "AC repair", description: "Cooling diagnosis and repair" },
          { name: "Heating repair", description: "Furnace and heat pump service" },
          { name: "Maintenance", description: "Seasonal tune-ups" },
        ]),
        hoursJson: JSON.stringify({
          monday: { open: "08:00", close: "18:00" },
          tuesday: { open: "08:00", close: "18:00" },
          wednesday: { open: "08:00", close: "18:00" },
          thursday: { open: "08:00", close: "18:00" },
          friday: { open: "08:00", close: "18:00" },
          saturday: { open: "09:00", close: "14:00" },
          sunday: { closed: true, open: "00:00", close: "00:00" },
        }),
        greeting:
          "Thanks for calling Summit HVAC. How can we help with your heating or cooling today?",
      },
    });
    console.log(`\n✅ Created Summit HVAC shell (${business.id})\n`);
  }

  console.log("Next unfinished steps (in order):");
  console.log("  1. Attach Twilio + Vapi dedicated line (product onboarding or npm run onboard)");
  console.log("  2. npm run wedge:ready          # score the live door");
  console.log("  3. Stripe keys → npm run billing:paste -- --secret sk_… --setup");
  console.log("  4. Weekly recovered-$ proof on this shop\n");

  if (!business.twilioPhone && !business.vapiPhoneNumber) {
    console.log("Status: shop shell only — no dedicated line yet (correct, not faked).\n");
  }

  process.exit(0);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
