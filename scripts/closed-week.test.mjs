/*
 * Closed dollars stay on the job type, for one shop. Equipment the caller
 * named is kept. A price is not, and a transcript does not invent a category.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { closedWeekLine } = await import("../src/lib/closed-week.ts");
const { extractLeadFromStructuredData } = await import("../src/lib/vapi.ts");
const { equipmentLine } = await import("../src/lib/equipment-fact.ts");
const { moneyBrief } = await import("../src/lib/desk-status.ts");
const { weekWorth } = await import("../src/lib/day-one.ts");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const money = {
  windowDays: 7,
  payments: true,
  invoices: true,
  collectedCents: 8_000,
  invoicedCents: 8_000,
  outstandingCents: 0,
  outstandingInvoices: 0,
  doneNotBilled: 0,
};

test("this week's closes name the job type and stay inside one shop", () => {
  const line = closedWeekLine([
    { businessId: "shop-a", categoryCode: "hvac.no_cool", postalCode: "10001", finalAmountCents: 45_000 },
    { businessId: "shop-a", categoryCode: "hvac.no_cool", postalCode: "10016", finalAmountCents: 45_000 },
    { businessId: "shop-a", categoryCode: null, postalCode: "10001", finalAmountCents: 20_000 },
  ]);
  assert.equal(line, "Closed $900 on 2 no cooling jobs near 100xx and $200 on 1 job with no job type near 100xx.");
  assert.equal(
    closedWeekLine([
      { businessId: "shop-a", categoryCode: "hvac.no_cool", postalCode: "10001", finalAmountCents: 45_000 },
      { businessId: "shop-b", categoryCode: "hvac.no_cool", postalCode: "10001", finalAmountCents: 45_000 },
    ]),
    null,
    "two shops are not one area price",
  );
  assert.equal(closedWeekLine([]), null);
  assert.equal(
    closedWeekLine([{ businessId: "shop-a", categoryCode: "hvac.no_cool", postalCode: "10001", finalAmountCents: 0 }]),
    null,
  );

  const closed = "Closed $900 on 2 no cooling jobs near 100xx.";
  assert.equal(
    weekWorth({ jobsBooked: 3, avgTicketCents: 40_000, collectedCents: 8_000, closed }),
    "3 jobs booked, about $1,200 at your $400 average. Closed $900 on 2 no cooling jobs near 100xx. Collected $80.",
  );
  assert.equal(
    moneyBrief(money, { jobsBooked: 3, avgTicketCents: 40_000, closed }).summary,
    "3 jobs booked, about $1,200 at your $400 average. Closed $900 on 2 no cooling jobs near 100xx. In the last 7 days: collected $80, billed $80.",
  );
});

test("equipment the caller named is kept, and a price is not", () => {
  const extracted = extractLeadFromStructuredData({
    systemType: "central AC",
    equipmentBrand: "Carrier",
    equipmentModel: "$4,500",
  });
  assert.equal(extracted.systemType, "central AC");
  assert.equal(extracted.equipmentBrand, "Carrier");
  assert.equal(extracted.equipmentModel, undefined);
  assert.equal(equipmentLine(extracted), "central AC · Carrier");
  const schema = read("src/lib/vapi.ts");
  assert.match(schema, /systemType:/);
  assert.doesNotMatch(schema, /price:/);
  assert.match(read("src/lib/call-ingest.ts"), /systemType: structured\.systemType/);
  assert.match(read("src/app/api/ring1/route.ts"), /businessId: business\.id/);
  assert.match(read("src/app/api/ring1/route.ts"), /closedWeekLine\(/);
  assert.match(read("prisma/turso-migrate.sql"), /ADD COLUMN "systemType"/);
  assert.match(read("prisma/turso-migrate.sql"), /ADD COLUMN "equipmentBrand"/);
  assert.match(read("prisma/turso-migrate.sql"), /ADD COLUMN "equipmentModel"/);
});
