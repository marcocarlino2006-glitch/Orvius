/*
 * Platform-wide sweeps must reach every shop, not just the first few hundred
 * rows the database happens to return.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();
const prisma = createScriptPrisma();
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a shop behind 500 already-reported shops still gets its weekly report", { timeout: 120_000 }, async () => {
  process.env.RESEND_API_KEY = "re_test";
  const sentTo = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("resend.com")) {
      sentTo.push(JSON.parse(init.body).to);
      return new Response(JSON.stringify({ id: "email_1" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return realFetch(input, init);
  };
  const stamp = Date.now();
  const recent = new Date();
  // Earlier suites leave due shops behind; park them so this one is the only shop due.
  const parked = await prisma.business.findMany({ where: { weeklyReportSentAt: null }, select: { id: true } });
  await prisma.business.updateMany({ where: { id: { in: parked.map((p) => p.id) } }, data: { weeklyReportSentAt: recent } });
  try {
    await prisma.business.createMany({
      data: Array.from({ length: 510 }, (_, i) => ({
        name: `Reported ${i}`,
        slug: `reported-${stamp}-${i}`,
        environment: "production",
        ownerEmail: `reported-${stamp}-${i}@orvius.test`,
        weeklyReportSentAt: recent,
        createdAt: new Date(Date.now() - 30 * 86_400_000),
        hoursJson: "{}",
        servicesJson: "[]",
      })),
    });
    const due = await prisma.business.create({
      data: { name: "Due Shop", slug: `due-${stamp}`, environment: "production", createdAt: new Date(Date.now() - 8 * 86_400_000), ownerEmail: `due-${stamp}@orvius.test`, hoursJson: "{}", servicesJson: "[]" },
    });
    const { sendDueWeeklyReports } = await import("../src/lib/weekly-report.ts");
    await sendDueWeeklyReports(new Date(), 5);
    assert.ok(sentTo.flat().includes(due.ownerEmail), "the due shop was emailed");
  } finally {
    globalThis.fetch = realFetch;
    await prisma.business.updateMany({ where: { id: { in: parked.map((p) => p.id) } }, data: { weeklyReportSentAt: null } });
    await prisma.business.deleteMany({ where: { slug: { startsWith: `reported-${stamp}-` } } });
    await prisma.business.deleteMany({ where: { slug: `due-${stamp}` } });
  }
});

test("overage billing rotates its start and stops on a time budget, so no shop is never invoiced", () => {
  const src = read("src/lib/overage-billing.ts");
  assert.match(src, /Math\.floor\(Math\.random\(\) \* pending\)/);
  assert.match(src, /if \(Date\.now\(\) - started > budgetMs\) break;/);
  assert.doesNotMatch(src, /take: 500/);
});

test("Vapi's number list is walked page by page everywhere it is read", () => {
  for (const file of ["src/lib/vapi.ts", "src/lib/line-watch.ts", "src/lib/sync-business-assistant.ts"]) {
    assert.doesNotMatch(read(file), /phone-number\?limit=100"/, file);
  }
});
