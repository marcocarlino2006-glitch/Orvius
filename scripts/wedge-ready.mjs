#!/usr/bin/env node
/**
 * Wedge definition-of-done — verifies a shop is production-grade.
 * Uses Turso-aware Prisma (same as app runtime).
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

function phonesEqual(a, b) {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return Boolean(left && right && left === right);
}

async function main() {
  const nameFilter = process.argv[2]?.trim();
  const business = nameFilter
    ? await prisma.business.findFirst({
        where: { isActive: true, name: { contains: nameFilter } },
        orderBy: { createdAt: "asc" },
      })
    : await prisma.business.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });

  if (!business) {
    console.error("❌ No active business — run onboarding first");
    process.exit(1);
  }

  const shopLines = [business.vapiPhoneNumber, business.twilioPhone].filter(
    Boolean,
  );
  const uniqueLines = [...new Set(shopLines.map((l) => normalizePhone(l) ?? l))];

  const collisions = [];
  for (const line of uniqueLines) {
    if (!line) continue;
    const others = await prisma.business.findMany({
      where: {
        isActive: true,
        id: { not: business.id },
        OR: [{ twilioPhone: line }, { vapiPhoneNumber: line }],
      },
      select: { id: true, name: true },
    });
    if (others.length > 0) {
      collisions.push({ line, others });
    }
  }

  const leadCount = await prisma.lead.count({
    where: { businessId: business.id },
  });
  const jobCount = await prisma.job.count({
    where: { businessId: business.id, status: { not: "cancelled" } },
  });
  const testAlert = await prisma.ownerNotification.findFirst({
    where: { businessId: business.id, status: "sent" },
    orderBy: { createdAt: "desc" },
  });
  const ownerPhoneOk =
    Boolean(business.ownerPhone?.trim()) &&
    !shopLines.some((line) => phonesEqual(business.ownerPhone, line));

  const items = [
    {
      label: "Dedicated shop line",
      ok: shopLines.length > 0,
      detail: shopLines[0] ?? "missing",
    },
    {
      label: "Line exclusive (no shared number)",
      ok: collisions.length === 0,
      detail:
        collisions.length === 0
          ? "unique"
          : collisions
              .map(
                (c) =>
                  `${c.line} also on ${c.others.map((o) => o.name).join(", ")}`,
              )
              .join("; "),
    },
    {
      label: "Line tested end-to-end",
      ok: Boolean(business.lineVerifiedAt),
      detail: business.lineVerifiedAt ? "verified" : "not verified",
    },
    {
      label: "Owner mobile configured",
      ok: ownerPhoneOk,
      detail: business.ownerPhone ?? "missing",
    },
    {
      label: "Owner SMS not opted out",
      ok: !business.ownerSmsOptOutAt,
      detail: business.ownerSmsOptOutAt
        ? `opted out ${business.ownerSmsOptOutAt.toISOString()}`
        : "active",
    },
    {
      label: "Owner alert delivered",
      ok: Boolean(testAlert),
      detail: testAlert ? `${testAlert.channel} sent` : "none sent",
    },
    {
      label: "First lead in inbox",
      ok: leadCount > 0,
      detail: `${leadCount} leads`,
    },
    {
      label: "Lead auto-books to dispatch",
      ok: jobCount > 0,
      detail: `${jobCount} jobs`,
    },
  ];

  console.log(`\n🎯 Wedge readiness — ${business.name}\n`);
  let score = 0;
  for (const item of items) {
    if (item.ok) score += 1;
    console.log(`${item.ok ? "✅" : "❌"} ${item.label}: ${item.detail}`);
  }

  console.log(`\nScore: ${score}/${items.length}`);
  if (score === items.length) {
    console.log("✅ WEDGE READY — shop is production-grade\n");
    process.exit(0);
  }

  if (collisions.length > 0) {
    console.log(
      "\nFix shared lines: npm run repair:lines — or node scripts/repair-shared-lines.mjs\n",
    );
  }
  console.log("❌ WEDGE NOT READY — complete checklist above\n");
  process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
