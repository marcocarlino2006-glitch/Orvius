#!/usr/bin/env node
/**
 * Pilot onboard helper — create/lookup a shop record and print the forward sheet.
 *
 * Does NOT buy Twilio numbers or touch Stripe/Resend (founder keys).
 * For a live dedicated line, use product onboarding (/login) or npm run onboard
 * after Twilio + Vapi secrets are set.
 *
 * Usage:
 *   npm run pilot:onboard -- --name "Summit HVAC" --owner-phone +15551234567
 *   npm run pilot:onboard -- --name "Summit HVAC" --owner-phone +15551234567 --owner-email owner@shop.com --trade HVAC --public-phone +15559876543
 *   npm run pilot:onboard -- --slug summit-hvac --print-only
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createScriptPrisma } from "./lib/db.mjs";
import {
  buildForwardSheet,
  buildSalesHonestyBullets,
  formatPhone,
} from "./lib/forward-sheet.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function arg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const TRADE_SERVICES = {
  HVAC: [
    { name: "AC repair", description: "Cooling diagnosis and repair" },
    { name: "Heating repair", description: "Furnace and heat pump service" },
    { name: "Maintenance", description: "Seasonal tune-ups" },
  ],
  Plumbing: [
    { name: "Leak repair", description: "Active leaks and pipe failures" },
    { name: "Drain cleaning", description: "Clogs and slow drains" },
    { name: "Water heater", description: "Repair and replacement" },
  ],
  Electrical: [
    { name: "Outlet & switch", description: "Residential electrical fixes" },
    { name: "Panel work", description: "Breakers and upgrades" },
    { name: "Emergency electrical", description: "No power / safety" },
  ],
};

const DEFAULT_HOURS = {
  monday: { open: "08:00", close: "18:00" },
  tuesday: { open: "08:00", close: "18:00" },
  wednesday: { open: "08:00", close: "18:00" },
  thursday: { open: "08:00", close: "18:00" },
  friday: { open: "08:00", close: "18:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: { closed: true, open: "00:00", close: "00:00" },
};

async function main() {
  const printOnly = hasFlag("--print-only");
  const name = arg("--name");
  const slugArg = arg("--slug");
  const ownerPhone = arg("--owner-phone");
  const ownerEmail = arg("--owner-email");
  const publicPhone = arg("--public-phone");
  const tradeRaw = (arg("--trade") ?? "HVAC").trim();
  const tradeKey = Object.keys(TRADE_SERVICES).find(
    (t) => t.toLowerCase() === tradeRaw.toLowerCase(),
  );
  const trade = tradeKey ?? "HVAC";

  if (!printOnly && !name && !slugArg) {
    console.error(`
Usage:
  npm run pilot:onboard -- --name "Summit HVAC" --owner-phone +15551234567
  npm run pilot:onboard -- --slug summit-hvac --print-only

Options:
  --name            Shop name (creates if missing)
  --slug            Explicit slug (optional)
  --owner-phone     Owner cell for SMS alerts (required on create)
  --owner-email     Owner email for SMS→email failover
  --public-phone    Shop's published Google/truck number (for the sheet)
  --trade           HVAC | Plumbing | Electrical (default HVAC)
  --print-only      Lookup existing shop and print sheet only
`);
    process.exit(1);
  }

  const prisma = createScriptPrisma();

  try {
    const slug = slugArg || (name ? slugify(name) : null);
    let business = null;

    if (slug) {
      business = await prisma.business.findUnique({ where: { slug } });
    }
    if (!business && ownerEmail) {
      business = await prisma.business.findFirst({
        where: { ownerEmail: ownerEmail.toLowerCase().trim() },
        orderBy: { createdAt: "asc" },
      });
    }

    if (printOnly) {
      if (!business) {
        console.error("❌ Shop not found. Pass --name to create, or a valid --slug.");
        process.exit(1);
      }
    } else if (!business) {
      if (!name || !ownerPhone) {
        console.error("❌ Creating a shop requires --name and --owner-phone.");
        process.exit(1);
      }

      let uniqueSlug = slug || slugify(name);
      let n = 0;
      while (await prisma.business.findUnique({ where: { slug: uniqueSlug } })) {
        n += 1;
        uniqueSlug = `${slugify(name)}-${n + 1}`;
      }

      const pilotEndsAt = new Date();
      pilotEndsAt.setDate(pilotEndsAt.getDate() + 30);

      business = await prisma.business.create({
        data: {
          name: name.trim(),
          slug: uniqueSlug,
          ownerPhone: ownerPhone.trim(),
          ownerEmail: ownerEmail?.trim().toLowerCase() || null,
          phone: publicPhone?.trim() || null,
          greeting: `Thank you for calling ${name.trim()}. How can I help you today?`,
          hoursJson: JSON.stringify(DEFAULT_HOURS),
          servicesJson: JSON.stringify(TRADE_SERVICES[trade]),
          billingStatus: "pilot",
          pilotEndsAt,
        },
      });
      console.log(`\n✅ Created pilot shop record: ${business.name} (${business.slug})`);
      console.log(
        "   No Twilio/Vapi line purchased here — assign a dedicated line via /login onboarding or npm run onboard.",
      );
    } else {
      console.log(`\nℹ️  Shop already exists: ${business.name} (${business.slug})`);
      const patch = {};
      if (ownerPhone?.trim()) patch.ownerPhone = ownerPhone.trim();
      if (ownerEmail?.trim()) patch.ownerEmail = ownerEmail.trim().toLowerCase();
      if (publicPhone?.trim()) patch.phone = publicPhone.trim();
      if (Object.keys(patch).length) {
        business = await prisma.business.update({
          where: { id: business.id },
          data: patch,
        });
        console.log("   Updated owner/public contact fields.");
      }
    }

    const orviusLine = business.vapiPhoneNumber || business.twilioPhone || null;

    console.log(
      "\n" +
        buildForwardSheet({
          shopName: business.name,
          orviusLine,
          publicShopPhone: publicPhone || business.phone,
          ownerPhone: business.ownerPhone,
          ownerEmail: business.ownerEmail,
        }),
    );

    console.log("\nSales honesty (say these out loud):\n");
    for (const bullet of buildSalesHonestyBullets()) {
      console.log(`  • ${bullet}`);
    }

    console.log("\nNext founder steps:");
    if (!orviusLine) {
      console.log("  1. Provision dedicated line (product onboarding or npm run onboard)");
    } else {
      console.log(`  1. Line ready: ${formatPhone(orviusLine)} — place a live test call`);
    }
    console.log("  2. Walk owner through forward (sheet above / /pilot/forward)");
    console.log("  3. Settings → overflow checkbox only after forward is real");
    console.log("  4. Stamp founder phone cert 5/5 + baselines");
    console.log("  5. Day 3 / Day 7 check-in with weekly proof\n");
    console.log(`Repo root: ${root}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(
    "\n❌ pilot:onboard failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
