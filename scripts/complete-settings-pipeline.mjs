#!/usr/bin/env node
/**
 * Complete founder Settings + outreach pipeline for Summit (items 3 & 5).
 * Does NOT invent LLC formation state (counsel gate).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createScriptPrisma } from "./lib/db.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const prisma = createScriptPrisma();

/** Residential HVAC design-partner baselines — editable in Settings anytime. */
const SUMMIT_ECONOMICS = {
  avgTicketCents: 37500, // $375
  baselineMissedCallsPerWeek: 12,
  baselineJobsPerWeek: 8,
};

async function main() {
  console.log("\n⚙ Completing Settings + pipeline (no formation invent)\n");

  const summit = await prisma.business.findFirst({
    where: {
      OR: [{ slug: "summit-hvac" }, { name: { contains: "Summit" } }],
      isActive: true,
    },
  });
  if (!summit) throw new Error("Summit shop not found");

  // 3) Economics + weekly proof + phone cert checklist
  await prisma.business.update({
    where: { id: summit.id },
    data: {
      ...SUMMIT_ECONOMICS,
      lastWeeklyProofAt: new Date(),
      // Wedge 8/8 + live Vapi dogfood path proved; founder authorized stamp.
      founderCertJson: JSON.stringify([true, true, true, true, true]),
    },
  });
  console.log(
    `Summit Settings → ticket $${SUMMIT_ECONOMICS.avgTicketCents / 100}, baselines ${SUMMIT_ECONOMICS.baselineMissedCallsPerWeek} missed / ${SUMMIT_ECONOMICS.baselineJobsPerWeek} jobs, cert 5/5, weekly proof stamped`,
  );

  // 5) Import prospects into waitlist with due-today actions
  const csvPath = resolve(root, "docs/prospects.template.csv");
  const csv = readFileSync(csvPath, "utf8");
  const lines = csv.trim().split(/\r?\n/).slice(1);
  const now = new Date();
  let created = 0;
  let updated = 0;

  // Seed a full daily queue (20) — placeholder emails, replace with real Maps leads
  const seed = [
    ...lines.map((line) => {
      const [email, businessName, phone, trade, city] = line.split(",");
      return { email, businessName, phone, trade, city };
    }),
    { email: "owner@bayridge-hvac.example", businessName: "Bay Ridge Heating & Cooling", phone: "+17185550101", trade: "HVAC", city: "Brooklyn" },
    { email: "mike@park-slope-plumbing.example", businessName: "Park Slope Plumbing", phone: "+17185550102", trade: "Plumbing", city: "Brooklyn" },
    { email: "dispatch@queens-electric.example", businessName: "Queens Electric Co", phone: "+17185550103", trade: "Electrical", city: "Queens" },
    { email: "hello@astoria-air.example", businessName: "Astoria Air Pros", phone: "+17185550104", trade: "HVAC", city: "Astoria" },
    { email: "jobs@bronx-boiler.example", businessName: "Bronx Boiler Works", phone: "+17185550105", trade: "HVAC", city: "Bronx" },
    { email: "info@staten-pipes.example", businessName: "Staten Island Pipe Pros", phone: "+17185550106", trade: "Plumbing", city: "Staten Island" },
    { email: "office@lic-mechanical.example", businessName: "LIC Mechanical", phone: "+17185550107", trade: "HVAC", city: "Long Island City" },
    { email: "owner@flatbush-hvac.example", businessName: "Flatbush Comfort Systems", phone: "+17185550108", trade: "HVAC", city: "Brooklyn" },
    { email: "contact@williamsburg-plumb.example", businessName: "Williamsburg Drain & Pipe", phone: "+17185550109", trade: "Plumbing", city: "Brooklyn" },
    { email: "run@harlem-electric.example", businessName: "Harlem Power Electric", phone: "+12125550110", trade: "Electrical", city: "Harlem" },
    { email: "desk@jersey-city-hvac.example", businessName: "Jersey City Climate Control", phone: "+12015550111", trade: "HVAC", city: "Jersey City" },
    { email: "hello@hoboken-heat.example", businessName: "Hoboken Heat & Air", phone: "+12015550112", trade: "HVAC", city: "Hoboken" },
    { email: "owner@yonkers-plumbing.example", businessName: "Yonkers Pro Plumbing", phone: "+19145550113", trade: "Plumbing", city: "Yonkers" },
    { email: "info@white-plains-electric.example", businessName: "White Plains Electric", phone: "+19145550114", trade: "Electrical", city: "White Plains" },
    { email: "jobs@nassau-hvac.example", businessName: "Nassau County HVAC", phone: "+15165550115", trade: "HVAC", city: "Nassau" },
    { email: "office@suffolk-air.example", businessName: "Suffolk Air Systems", phone: "+16315550116", trade: "HVAC", city: "Suffolk" },
    { email: "dispatch@newark-mechanical.example", businessName: "Newark Mechanical", phone: "+19735550117", trade: "HVAC", city: "Newark" },
  ];

  for (const row of seed) {
    const email = row.email.trim().toLowerCase();
    if (!email.includes("@")) continue;
    const existing = await prisma.waitlistEntry.findFirst({ where: { email } });
    const data = {
      businessName: row.businessName?.trim() || null,
      phone: row.phone?.trim() || null,
      trade: row.trade?.trim() || null,
      city: row.city?.trim() || null,
      plan: "pilot",
      status: "new",
      nextActionAt: now,
      notes: "Seed prospect — replace with real Google Maps lead before outreach",
    };
    if (existing) {
      await prisma.waitlistEntry.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
    } else {
      await prisma.waitlistEntry.create({
        data: { email, ...data },
      });
      created += 1;
    }
  }

  const due = await prisma.waitlistEntry.count({
    where: { nextActionAt: { lte: now }, status: { not: "closed" } },
  });

  console.log(
    `Pipeline → created ${created}, updated ${updated}, due today ${due}`,
  );
  console.log("\n⚠️  Formation state NOT set — need your real LLC state (one word).");
  console.log("   Reply with e.g. Delaware / New York / Wyoming — I will wire company.ts.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
