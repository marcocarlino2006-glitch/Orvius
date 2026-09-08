#!/usr/bin/env node
/**
 * Classify leads and jobs that were written before demand capture existed.
 *
 * Calls already answered are the only history this dataset will ever have —
 * there is no re-running last winter's phone traffic. Rows the classifier
 * cannot read are left null on purpose, so a better classifier can revisit
 * them instead of inheriting a wrong code.
 *
 * Run: npm run backfill:demand -- [--commit]
 */
import { PrismaClient } from "@prisma/client";

import { deriveDemandSignal, tradeForCapture } from "../src/lib/demand-capture.ts";
import { demandCategoryLabel } from "../src/lib/job-taxonomy.ts";

const prisma = new PrismaClient();
const commit = process.argv.includes("--commit");

async function main() {
  const businesses = await prisma.business.findMany({
    select: { id: true, name: true, servicesJson: true },
  });

  const totals = { leads: 0, leadsCoded: 0, jobs: 0, jobsCoded: 0, zips: 0 };
  const histogram = new Map();

  for (const business of businesses) {
    const trade = tradeForCapture(business);

    const leads = await prisma.lead.findMany({
      where: {
        businessId: business.id,
        OR: [{ categoryCode: null }, { postalCode: null }],
      },
      select: {
        id: true,
        serviceType: true,
        notes: true,
        address: true,
        categoryCode: true,
        postalCode: true,
        call: { select: { summary: true } },
      },
    });

    for (const lead of leads) {
      totals.leads += 1;
      const signal = deriveDemandSignal({
        serviceType: lead.serviceType,
        notes: lead.notes,
        summary: lead.call?.summary,
        address: lead.address,
        trade,
      });

      const categoryCode = lead.categoryCode ?? signal.categoryCode;
      const postalCode = lead.postalCode ?? signal.postalCode;
      if (categoryCode) {
        totals.leadsCoded += 1;
        histogram.set(categoryCode, (histogram.get(categoryCode) ?? 0) + 1);
      }
      if (postalCode) totals.zips += 1;

      if (commit && (categoryCode || postalCode)) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            categoryCode: categoryCode ?? undefined,
            postalCode: postalCode ?? undefined,
          },
        });
      }
    }

    const jobs = await prisma.job.findMany({
      where: {
        businessId: business.id,
        OR: [{ categoryCode: null }, { postalCode: null }],
      },
      select: {
        id: true,
        serviceType: true,
        notes: true,
        address: true,
        categoryCode: true,
        postalCode: true,
        lead: { select: { categoryCode: true, postalCode: true } },
      },
    });

    for (const job of jobs) {
      totals.jobs += 1;
      // The lead is the better source: it was classified next to the call.
      const inherited = {
        categoryCode: job.lead?.categoryCode ?? null,
        postalCode: job.lead?.postalCode ?? null,
      };
      const signal =
        inherited.categoryCode && inherited.postalCode
          ? inherited
          : deriveDemandSignal({
              serviceType: job.serviceType,
              notes: job.notes,
              address: job.address,
              trade,
            });

      const categoryCode =
        job.categoryCode ?? inherited.categoryCode ?? signal.categoryCode;
      const postalCode =
        job.postalCode ?? inherited.postalCode ?? signal.postalCode;
      if (categoryCode) totals.jobsCoded += 1;

      if (commit && (categoryCode || postalCode)) {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            categoryCode: categoryCode ?? undefined,
            postalCode: postalCode ?? undefined,
          },
        });
      }
    }
  }

  const pct = (n, d) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);

  console.log(commit ? "\nBackfill (committed)\n" : "\nBackfill (dry run)\n");
  console.log(`  Shops scanned      ${businesses.length}`);
  console.log(
    `  Leads              ${totals.leadsCoded}/${totals.leads} classified (${pct(totals.leadsCoded, totals.leads)})`,
  );
  console.log(
    `  Jobs               ${totals.jobsCoded}/${totals.jobs} classified (${pct(totals.jobsCoded, totals.jobs)})`,
  );
  console.log(
    `  ZIPs resolved      ${totals.zips}/${totals.leads} leads (${pct(totals.zips, totals.leads)})`,
  );

  if (histogram.size) {
    console.log("\n  Demand mix now countable:");
    for (const [code, count] of [...histogram].sort((a, b) => b[1] - a[1])) {
      console.log(
        `    ${String(count).padStart(4)}  ${code.padEnd(22)} ${demandCategoryLabel(code) ?? ""}`,
      );
    }
  }

  if (!commit) console.log("\n  Re-run with --commit to write.\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
