#!/usr/bin/env node
/**
 * War-ready data repair (everything except Stripe + counsel formation).
 *
 * - Summit: owner email for SMS→email backup
 * - Quarantine Journey Test (shared assistant pollution)
 * - Clear shared Vapi assistants across shops
 * - Normalize owner phones
 * - Provision dedicated line for active shops missing one (Tlory)
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createScriptPrisma } from "./lib/db.mjs";

const FOUNDER_EMAIL = "marcocarlino2006@gmail.com";
const FOUNDER_PHONE = "+13472584837";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function normalizePhone(phone) {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone.trim().startsWith("+") ? phone.trim() : null;
}

const prisma = createScriptPrisma();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`\n⚔ War-ready repair${dryRun ? " (dry-run)" : ""}\n`);

  const shops = await prisma.business.findMany({
    orderBy: { createdAt: "asc" },
  });

  // 1) Summit owner email + phone normalize
  const summit = shops.find(
    (s) => s.slug === "summit-hvac" || s.name.toLowerCase().includes("summit"),
  );
  if (summit) {
    const data = {};
    if (!summit.ownerEmail?.trim()) data.ownerEmail = FOUNDER_EMAIL;
    const phone = normalizePhone(summit.ownerPhone);
    if (phone && phone !== summit.ownerPhone) data.ownerPhone = phone;
    if (Object.keys(data).length) {
      console.log(`Summit → ${JSON.stringify(data)}`);
      if (!dryRun) {
        await prisma.business.update({ where: { id: summit.id }, data });
      }
    } else {
      console.log("Summit → owner contact already set");
    }
  }

  // 2) Quarantine Journey Test (shares Summit assistant)
  const journey = shops.find((s) => s.slug === "journey-test-hvac");
  if (journey && journey.isActive) {
    console.log(
      `Journey Test → deactivate + clear shared assistant (${journey.vapiAssistantId})`,
    );
    if (!dryRun) {
      await prisma.business.update({
        where: { id: journey.id },
        data: {
          isActive: false,
          vapiAssistantId: null,
          twilioPhone: null,
          vapiPhoneNumber: null,
          lineVerifiedAt: null,
        },
      });
    }
  } else if (journey) {
    console.log("Journey Test → already inactive");
  }

  // 3) Shared assistant collisions (active shops only)
  const active = await prisma.business.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      vapiAssistantId: true,
      createdAt: true,
      lineVerifiedAt: true,
    },
  });
  /** @type {Map<string, typeof active>} */
  const byAssistant = new Map();
  for (const shop of active) {
    if (!shop.vapiAssistantId) continue;
    const list = byAssistant.get(shop.vapiAssistantId) ?? [];
    list.push(shop);
    byAssistant.set(shop.vapiAssistantId, list);
  }
  for (const [assistantId, holders] of byAssistant) {
    if (holders.length < 2) continue;
    const keep = holders.find((h) => h.lineVerifiedAt) ?? holders[0];
    console.log(`\nShared assistant ${assistantId}`);
    console.log(`  KEEP  ${keep.name}`);
    for (const shop of holders.filter((h) => h.id !== keep.id)) {
      console.log(`  CLEAR ${shop.name}`);
      if (!dryRun) {
        await prisma.business.update({
          where: { id: shop.id },
          data: { vapiAssistantId: null },
        });
      }
    }
  }

  // 4) Normalize Tlory owner contact
  const tlory = shops.find((s) => s.slug === "tlory");
  if (tlory) {
    const phone = normalizePhone(tlory.ownerPhone) ?? FOUNDER_PHONE;
    const data = {};
    if (phone !== tlory.ownerPhone) data.ownerPhone = phone;
    if (!tlory.ownerEmail?.trim()) data.ownerEmail = FOUNDER_EMAIL;
    if (Object.keys(data).length) {
      console.log(`Tlory contact → ${JSON.stringify(data)}`);
      if (!dryRun) {
        await prisma.business.update({ where: { id: tlory.id }, data });
      }
    }
  }

  // 5) Shared-line repair
  if (!dryRun) {
    const shared = spawnSync("node", ["scripts/repair-shared-lines.mjs"], {
      cwd: root,
      encoding: "utf8",
    });
    process.stdout.write(shared.stdout ?? "");
    if (shared.status) process.stderr.write(shared.stderr ?? "");
  }

  // 6) Provision missing dedicated lines for active non-demo shops
  if (!dryRun) {
    console.log("\nProvisioning missing dedicated lines…");
    const provision = spawnSync(
      "npx",
      ["tsx", "scripts/provision-missing-lines.ts"],
      {
        cwd: root,
        encoding: "utf8",
        env: process.env,
      },
    );
    process.stdout.write(provision.stdout ?? "");
    if (provision.stderr) process.stderr.write(provision.stderr);
    if (provision.status) {
      console.log(
        "\n⚠️  Line provision had errors — check Twilio/Vapi; Summit kept on demo line.\n",
      );
    }
  }

  console.log("\n✅ War-ready repair complete\n");
  console.log("Still founder-only:");
  console.log("  • Stripe keys + stripe:setup + webhook");
  console.log("  • RESEND_API_KEY (email backup)");
  console.log("  • Settings → 5 phone cert scenarios (real calls)");
  console.log("  • Settings → avg ticket + baselines + weekly proof");
  console.log("  • Counsel → formation state");
  console.log("  • Admin → import prospects CSV + daily touches\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
