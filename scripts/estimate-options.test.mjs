/*
 * Good / Better / Best: the customer can only accept by picking one option,
 * and the price they picked is what the estimate, the invoice and "I paid"
 * charge. The shop can record a choice made by phone, and can switch it until
 * money is recorded.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { buildEstimateOptions, estimateOptionsInput, parseEstimateOptions, startingAmountCents, estimateTitle } =
  await import("../src/lib/estimate-options.ts");
const { acceptEstimate } = await import("../src/lib/estimate-choice.ts");
const route = await import("../src/app/api/public/estimate/[token]/route.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
let ip = 10;
const call = (method, token, body) =>
  route[method](
    new Request(`http://localhost/api/public/estimate/${token}`, {
      method,
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.8.${ip++}` },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve({ token }) },
  );

const OPTIONS = buildEstimateOptions([
  { amountCents: 45_000, description: "Replace the failed capacitor" },
  { amountCents: 89_000, description: "Capacitor, contactor and a tune-up" },
  { label: "New system", amountCents: 690_000, description: "Replace the condenser, 10-year warranty" },
]);

async function shopWithEstimate(options = OPTIONS) {
  const business = await prisma.business.create({
    data: { name: "Tier Air", slug: `tier-${stamp()}`, environment: "production", timezone: "America/Chicago" },
  });
  const job = await prisma.job.create({ data: { businessId: business.id, title: "AC not cooling", status: "scheduled" } });
  const estimate = await prisma.estimate.create({
    data: {
      businessId: business.id,
      jobId: job.id,
      amountCents: options.length ? startingAmountCents(options) : 30_000,
      optionsJson: JSON.stringify(options),
      status: "sent",
      publicToken: `tok-${stamp()}`,
      sentAt: new Date(),
    },
  });
  return { business, job, estimate };
}

test("options are named Good, Better, Best unless the shop names them, and read back safely", () => {
  assert.deepEqual(
    OPTIONS.map((o) => [o.key, o.label, o.amountCents]),
    [["good", "Good", 45_000], ["better", "Better", 89_000], ["best", "New system", 690_000]],
  );
  assert.equal(estimateOptionsInput.safeParse([{ amountCents: 5000 }]).success, false, "one option is not a choice");
  assert.equal(estimateOptionsInput.safeParse([{ amountCents: 5000 }, { amountCents: 500 }]).success, false, "under $10");
  assert.deepEqual(parseEstimateOptions("not json"), []);
  assert.deepEqual(parseEstimateOptions('[{"key":"good","amountCents":-4}]'), []);
  assert.equal(startingAmountCents(OPTIONS), 45_000);
  const money = (c) => `$${c / 100}`;
  assert.equal(estimateTitle({ amountCents: 45_000, optionsJson: JSON.stringify(OPTIONS) }, money), "Estimate · 3 options from $450");
  assert.equal(estimateTitle({ amountCents: 89_000, optionsJson: JSON.stringify(OPTIONS), chosenOption: "better" }, money), "Estimate · $890 · Better");
  assert.equal(estimateTitle({ amountCents: 30_000, optionsJson: "[]" }, money), "Estimate · $300");
});

test("the customer must pick one, and the picked price is what is invoiced and paid", async () => {
  const { business, job, estimate } = await shopWithEstimate();
  try {
    const shown = await (await call("GET", estimate.publicToken)).json();
    assert.deepEqual(shown.estimate.options.map((o) => o.amountLabel), ["$450", "$890", "$6,900"]);
    assert.equal(shown.estimate.chosenOption, null);

    const noPick = await call("POST", estimate.publicToken, { action: "accept" });
    assert.equal(noPick.status, 400);
    assert.match((await noPick.json()).error, /Pick one/);
    const payFirst = await call("POST", estimate.publicToken, { action: "pay_manual" });
    assert.equal(payFirst.status, 400, "no paying before choosing");
    assert.equal(await prisma.invoice.count({ where: { estimateId: estimate.id } }), 0);

    const bogus = await call("POST", estimate.publicToken, { action: "accept", option: "platinum" });
    assert.equal(bogus.status, 400);

    const accepted = await (await call("POST", estimate.publicToken, { action: "accept", option: "better" })).json();
    assert.equal(accepted.estimate.chosenOption, "better");
    assert.equal(accepted.estimate.amountCents, 89_000);
    assert.equal(accepted.estimate.status, "accepted");
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { estimateId: estimate.id } });
    assert.equal(invoice.amountCents, 89_000);

    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { jobId: job.id, action: "estimate.accepted" } });
    assert.equal(audit.summary, "The customer chose Better · $890.");

    await call("POST", estimate.publicToken, { action: "pay_manual" });
    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: invoice.id } });
    assert.equal(payment.amountCents, 89_000);

    const late = await call("POST", estimate.publicToken, { action: "accept", option: "best" });
    assert.equal(late.status, 409, "a paid choice is locked");
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).amountCents, 89_000);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("the shop records a phone choice and can switch it before money is taken", async () => {
  const { business, job, estimate } = await shopWithEstimate();
  try {
    const first = await acceptEstimate({ estimateId: estimate.id, optionKey: "good", by: "shop", actor: "owner", actorEmail: "o@t.test" });
    assert.equal(first.ok, true);
    const switched = await acceptEstimate({ estimateId: estimate.id, optionKey: "best", by: "shop", actor: "owner", actorEmail: "o@t.test" });
    assert.equal(switched.ok, true);
    const fresh = await prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id }, include: { invoice: true } });
    assert.equal(fresh.chosenOption, "best");
    assert.equal(fresh.amountCents, 690_000);
    assert.equal(fresh.invoice.amountCents, 690_000, "the open invoice follows the switch");
    const audits = await prisma.auditEvent.findMany({ where: { jobId: job.id, action: "estimate.accepted" }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(audits.map((a) => a.summary), ["The shop chose Good · $450.", "The shop chose New system · $6,900."]);
    const again = await acceptEstimate({ estimateId: estimate.id, optionKey: "best", by: "shop", actor: "owner" });
    assert.equal(again.ok, true);
    assert.equal(await prisma.auditEvent.count({ where: { jobId: job.id, action: "estimate.accepted" } }), 2, "re-saving the same choice is not news");
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a single-price estimate still accepts with no option", async () => {
  const { business, estimate } = await shopWithEstimate([]);
  try {
    const res = await (await call("POST", estimate.publicToken, { action: "accept" })).json();
    assert.equal(res.estimate.status, "accepted");
    assert.deepEqual(res.estimate.options, []);
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { estimateId: estimate.id } })).amountCents, 30_000);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});
