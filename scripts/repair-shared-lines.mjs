#!/usr/bin/env node
/**
 * One number → one shop.
 * Keeps the oldest verified (or oldest) shop on each shared line;
 * clears twilioPhone / vapiPhoneNumber from colliding shops.
 */
import { createScriptPrisma } from "./lib/db.mjs";

const prisma = createScriptPrisma();

function normalizePhone(phone) {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 7 ? digits : null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const shops = await prisma.business.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      twilioPhone: true,
      vapiPhoneNumber: true,
      lineVerifiedAt: true,
      createdAt: true,
    },
  });

  /** @type {Map<string, typeof shops>} */
  const byLine = new Map();
  for (const shop of shops) {
    for (const raw of [shop.twilioPhone, shop.vapiPhoneNumber]) {
      const line = normalizePhone(raw) ?? raw?.trim();
      if (!line) continue;
      const list = byLine.get(line) ?? [];
      if (!list.some((s) => s.id === shop.id)) list.push(shop);
      byLine.set(line, list);
    }
  }

  let cleared = 0;
  for (const [line, holders] of byLine) {
    if (holders.length < 2) continue;
    const keep = holders[0];
    console.log(`\nLine ${line}`);
    console.log(`  KEEP  ${keep.name} (${keep.id})`);
    for (const shop of holders.slice(1)) {
      console.log(`  CLEAR ${shop.name} (${shop.id})`);
      if (!dryRun) {
        await prisma.business.update({
          where: { id: shop.id },
          data: {
            twilioPhone: null,
            vapiPhoneNumber: null,
          },
        });
      }
      cleared += 1;
    }
  }

  if (cleared === 0) {
    console.log("\n✅ No shared-line collisions\n");
  } else {
    console.log(
      `\n${dryRun ? "Would clear" : "Cleared"} ${cleared} colliding shop line(s).\n`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
