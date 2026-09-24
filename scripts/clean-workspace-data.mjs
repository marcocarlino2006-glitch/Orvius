#!/usr/bin/env node
/**
 * Workspace hygiene. Dry run by default; pass --apply to write.
 *
 *   npm run data:clean            # report only
 *   npm run data:clean -- --apply # remove fixtures, drop duplicate jobs, re-date demo
 *
 * - Production workspaces: removes fixture contacts (E2E Test Caller, Dana
 *   Caller, 555-01xx numbers) and their calls, leads and jobs. Records with
 *   money attached are reported and never touched.
 * - All workspaces: drops duplicate jobs (same customer and service opened
 *   within a day), keeping the earliest.
 * - Demo workspaces: moves open jobs that drifted into the past onto the next
 *   working days.
 */
import { createScriptPrisma } from "./lib/db.mjs";
import {
  findDuplicateJobs,
  isFixtureContact,
  realisticDemoSlots,
} from "../src/lib/workspace-hygiene.ts";

const apply = process.argv.includes("--apply");
const prisma = createScriptPrisma();
const OPEN = ["scheduled", "confirmed"];

async function moneyJobIds(jobIds) {
  if (jobIds.length === 0) return new Set();
  const [invoices, deposits] = await Promise.all([
    prisma.invoice.findMany({ where: { jobId: { in: jobIds } }, select: { jobId: true } }),
    prisma.deposit.findMany({ where: { jobId: { in: jobIds } }, select: { jobId: true } }),
  ]);
  return new Set([...invoices, ...deposits].map((row) => row.jobId));
}

async function purgeFixtures(business) {
  const [customers, looseLeads] = await Promise.all([
    prisma.customer.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true, phone: true, notes: true },
    }),
    prisma.lead.findMany({
      where: { businessId: business.id, customerId: null },
      select: { id: true, name: true, phone: true, notes: true, callId: true },
    }),
  ]);
  const fixtureCustomers = customers.filter(isFixtureContact);
  const fixtureLeads = looseLeads.filter(isFixtureContact);
  if (fixtureCustomers.length === 0 && fixtureLeads.length === 0) return { removed: 0, kept: 0 };

  const customerIds = fixtureCustomers.map((c) => c.id);
  const jobs = await prisma.job.findMany({
    where: {
      businessId: business.id,
      OR: [
        { customerId: { in: customerIds } },
        { leadId: { in: fixtureLeads.map((l) => l.id) } },
      ],
    },
    select: { id: true, customerId: true, leadId: true },
  });
  const withMoney = await moneyJobIds(jobs.map((j) => j.id));
  const blockedCustomers = new Set(
    jobs.filter((j) => withMoney.has(j.id)).map((j) => j.customerId).filter(Boolean),
  );
  const blockedLeads = new Set(
    jobs.filter((j) => withMoney.has(j.id)).map((j) => j.leadId).filter(Boolean),
  );

  const removableCustomers = fixtureCustomers.filter((c) => !blockedCustomers.has(c.id));
  const removableLeads = fixtureLeads.filter((l) => !blockedLeads.has(l.id));
  for (const c of fixtureCustomers) {
    console.log(
      `   ${blockedCustomers.has(c.id) ? "keep (money attached)" : "remove"} customer ${c.name ?? "—"} ${c.phone}`,
    );
  }
  for (const l of fixtureLeads) {
    console.log(`   ${blockedLeads.has(l.id) ? "keep (money attached)" : "remove"} lead ${l.name ?? "—"} ${l.phone ?? ""}`);
  }

  if (apply) {
    const rmCustomerIds = removableCustomers.map((c) => c.id);
    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { customerId: { in: rmCustomerIds } },
          { id: { in: removableLeads.map((l) => l.id) } },
        ],
      },
      select: { id: true, callId: true },
    });
    const leadIds = leads.map((l) => l.id);
    const calls = await prisma.call.findMany({
      where: {
        businessId: business.id,
        OR: [
          { customerId: { in: rmCustomerIds } },
          { id: { in: leads.map((l) => l.callId).filter(Boolean) } },
        ],
      },
      select: { id: true },
    });
    const callIds = calls.map((c) => c.id);
    const jobIds = jobs
      .filter((j) => !withMoney.has(j.id))
      .filter((j) => rmCustomerIds.includes(j.customerId) || leadIds.includes(j.leadId))
      .map((j) => j.id);

    await prisma.$transaction([
      prisma.auditEvent.deleteMany({
        where: {
          businessId: business.id,
          OR: [
            { customerId: { in: rmCustomerIds } },
            { leadId: { in: leadIds } },
            { callId: { in: callIds } },
            { jobId: { in: jobIds } },
          ],
        },
      }),
      prisma.job.deleteMany({ where: { id: { in: jobIds } } }),
      prisma.lead.deleteMany({ where: { id: { in: leadIds } } }),
      prisma.call.deleteMany({ where: { id: { in: callIds } } }),
      prisma.customer.deleteMany({ where: { id: { in: rmCustomerIds } } }),
    ]);
  }
  return {
    removed: removableCustomers.length + removableLeads.length,
    kept: fixtureCustomers.length + fixtureLeads.length - removableCustomers.length - removableLeads.length,
  };
}

async function dropDuplicateJobs(business) {
  const jobs = await prisma.job.findMany({
    where: { businessId: business.id },
    select: {
      id: true,
      businessId: true,
      customerId: true,
      serviceType: true,
      title: true,
      status: true,
      createdAt: true,
    },
  });
  const withMoney = await moneyJobIds(jobs.map((j) => j.id));
  const pairs = findDuplicateJobs(jobs.map((j) => ({ ...j, hasMoney: withMoney.has(j.id) })));
  for (const pair of pairs) console.log(`   duplicate job ${pair.drop} (keeps ${pair.keep})`);
  if (apply && pairs.length > 0) {
    const drop = pairs.map((p) => p.drop);
    await prisma.$transaction([
      prisma.auditEvent.deleteMany({ where: { jobId: { in: drop } } }),
      prisma.job.deleteMany({ where: { id: { in: drop } } }),
    ]);
  }
  return pairs.length;
}

async function redateDemo(business) {
  const stale = await prisma.job.findMany({
    where: { businessId: business.id, status: { in: OPEN }, scheduledAt: { lt: new Date() } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true },
  });
  if (stale.length === 0) return 0;
  const slots = realisticDemoSlots(stale.length);
  console.log(`   re-date ${stale.length} open demo job(s) onto the next working days`);
  if (apply) {
    await prisma.$transaction(
      stale.map((job, i) =>
        prisma.job.update({ where: { id: job.id }, data: { scheduledAt: slots[i] } }),
      ),
    );
  }
  return stale.length;
}

async function main() {
  console.log(`\nWorkspace hygiene — ${apply ? "APPLYING" : "dry run (pass --apply to write)"}\n`);
  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, slug: true, environment: true },
    orderBy: { createdAt: "asc" },
  });
  const totals = { fixtures: 0, keptForMoney: 0, duplicates: 0, redated: 0 };

  for (const business of businesses) {
    const header = `• ${business.name} (${business.slug}) — ${business.environment}`;
    const log = console.log;
    let printed = false;
    console.log = (...args) => {
      if (!printed) {
        log(header);
        printed = true;
      }
      log(...args);
    };
    if (business.environment === "production") {
      const { removed, kept } = await purgeFixtures(business);
      totals.fixtures += removed;
      totals.keptForMoney += kept;
    }
    totals.duplicates += await dropDuplicateJobs(business);
    if (business.environment === "demo") totals.redated += await redateDemo(business);
    console.log = log;
  }

  console.log(
    `\n${apply ? "Done" : "Would change"}: ${totals.fixtures} fixture record(s) out of production, ` +
      `${totals.duplicates} duplicate job(s), ${totals.redated} demo job(s) re-dated` +
      (totals.keptForMoney ? `; ${totals.keptForMoney} kept because money is attached` : "") +
      ".\n",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
