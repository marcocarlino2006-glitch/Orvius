import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dayOne, weekBooked, weekWorth } from "../src/lib/day-one.ts";
import { moneyBrief } from "../src/lib/desk-status.ts";

const openShop = {
  live: true,
  numberProved: false,
  chargesEnabled: false,
  avgTicketCents: null,
  jobsBooked: 0,
  collectedCents: 0,
};

test("day one stays open until the number, the card account, and the ticket are real", () => {
  const fresh = dayOne(openShop);
  assert.equal(fresh.open, true);
  assert.deepEqual(
    fresh.steps.map((step) => step.id),
    ["number", "card", "ticket"],
  );
  assert.equal(fresh.steps[0].href, "/dashboard?settings=phone");
  assert.equal(fresh.steps[1].href, "/dashboard/billing");
  assert.equal(fresh.steps[2].href, null);
  assert.match(fresh.steps[0].detail, /assigned with your line/);
  assert.match(fresh.steps[1].detail, /1%/);

  const numberOnly = dayOne({ ...openShop, numberProved: true });
  assert.equal(numberOnly.open, true);
  assert.equal(numberOnly.steps[0].done, true);
  assert.equal(numberOnly.steps[0].href, null);

  const ready = dayOne({
    ...openShop,
    numberProved: true,
    chargesEnabled: true,
    avgTicketCents: 40_000,
    jobsBooked: 3,
    collectedCents: 8_000,
  });
  assert.equal(ready.open, false);
  assert.equal(ready.worth, "3 jobs booked, about $1,200 at your $400 average. Collected $80.");
});

test("a demo or a shop still in test mode does not get the day-one list", () => {
  assert.equal(dayOne({ ...openShop, live: false }).open, false);
  assert.equal(
    dayOne({ ...openShop, live: false, numberProved: true, chargesEnabled: true, avgTicketCents: 40_000 }).open,
    false,
  );
});

test("week dollars use the ticket when it exists and still say what was collected", () => {
  assert.equal(
    weekWorth({ jobsBooked: 1, avgTicketCents: 35_000, collectedCents: 0 }),
    "1 job booked, about $350 at your $350 average. Collected nothing.",
  );
  assert.equal(
    weekWorth({ jobsBooked: 0, avgTicketCents: 40_000, collectedCents: 1_250 }),
    "No jobs booked this week at your $400 average. Collected $12.50.",
  );
  assert.equal(
    weekWorth({ jobsBooked: 4, avgTicketCents: null, collectedCents: 2_000 }),
    "Set your average ticket to see what this week's jobs are worth. Collected $20.",
  );
  assert.equal(
    weekWorth({ jobsBooked: 2, avgTicketCents: null, collectedCents: 0, moneyPaused: true }),
    "Set your average ticket to see what this week's jobs are worth. Collected dollars are paused until the books can be read.",
  );
  assert.equal(weekBooked({ jobsBooked: 2, avgTicketCents: null }), null);
});

test("the money line adds booked value only when the ticket is set", () => {
  const money = {
    windowDays: 7,
    invoicedCents: 40_000,
    invoices: 1,
    collectedCents: 40_000,
    payments: 1,
    outstandingCents: 0,
    outstandingInvoices: 0,
    doneNotBilled: 0,
  };
  assert.equal(moneyBrief(money).summary, "In the last 7 days: collected $400, billed $400.");
  assert.equal(
    moneyBrief(money, { jobsBooked: 3, avgTicketCents: 40_000 }).summary,
    "3 jobs booked, about $1,200 at your $400 average. In the last 7 days: collected $400, billed $400.",
  );
  assert.equal(
    moneyBrief(money, { jobsBooked: 3, avgTicketCents: null }).summary,
    "In the last 7 days: collected $400, billed $400.",
  );
});

test("Command shows day one from the proved call, card charges, and the ticket", () => {
  const route = readFileSync(new URL("../src/app/api/ring1/route.ts", import.meta.url), "utf8");
  const desk = readFileSync(new URL("../src/components/ring1-command-center.tsx", import.meta.url), "utf8");
  const version = readFileSync(new URL("../src/lib/shop-version.ts", import.meta.url), "utf8");
  assert.match(route, /dayOne\(\{[\s\S]*numberProved: Boolean\(line\) \|\| business\.lineVerifiedAt != null \|\| business\.overflowProvedAt != null[\s\S]*chargesEnabled: connect\.chargesEnabled/);
  assert.match(route, /environment === "production"/);
  assert.match(route, /!isDemoBusiness\(business\)/);
  assert.match(desk, /dayOne\?\.open[\s\S]*<DayOnePanel/);
  assert.ok(desk.indexOf("<DayOnePanel") < desk.indexOf("cmd-headline"), "day one is the first read");
  assert.match(version, /updatedAt: true/);
});
