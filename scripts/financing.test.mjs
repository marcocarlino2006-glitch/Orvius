#!/usr/bin/env node
/*
 * Pay over time: an owner switches it on, Stripe activates Affirm and Klarna
 * on the shop's own account, and only then, and only for amounts each lender
 * covers, does a customer's pay link offer them. Nothing inactive ever reaches
 * a checkout, and nothing promises approval.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { checkoutPaymentMethods, financingFor, financingLine, financingMethodsFromAccount, FINANCING_COST_NOTE } from "../src/lib/financing.ts";
import { FinancingRefused, setShopFinancing } from "../src/lib/financing-setup.ts";
import { syncConnectAccount } from "../src/lib/stripe-connect.ts";

const prisma = new PrismaClient();
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

async function shop(data = {}) {
  const row = await prisma.business.create({
    data: { name: "Finance Air", slug: `fin-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test", ...data },
  });
  made.push(row.id);
  return row;
}

test("each lender only shows for amounts it covers, and only once switched on", () => {
  const on = { financingEnabled: true, financingMethods: "affirm,klarna" };
  assert.deepEqual(financingFor({ ...on, financingEnabled: false }, 900_000), []);
  assert.deepEqual(financingFor(on, 4_000), ["klarna"]);
  assert.deepEqual(financingFor(on, 900_000), ["affirm", "klarna"]);
  assert.deepEqual(financingFor(on, 2_000_000), ["affirm"]);
  assert.deepEqual(financingFor(on, 4_000_000), []);
  assert.deepEqual(financingFor({ financingEnabled: true, financingMethods: "affirm,bogus" }, 900_000), ["affirm"]);
  assert.equal(checkoutPaymentMethods(on, 1_000), undefined, "no financing keeps Stripe's own defaults");
  assert.deepEqual(checkoutPaymentMethods(on, 900_000), ["card", "affirm", "klarna"]);
  assert.match(financingLine(["affirm", "klarna"]), /Affirm or Klarna, if you're approved/);
  assert.equal(financingLine([]), null);
  assert.match(FINANCING_COST_NOTE, /more for these than for a card/);
});

test("only methods Stripe marks active count", () => {
  assert.deepEqual(financingMethodsFromAccount({ capabilities: { affirm_payments: "active", klarna_payments: "pending" } }), ["affirm"]);
  assert.deepEqual(financingMethodsFromAccount({ capabilities: {} }), []);
});

test("switching on asks Stripe for both; customers see only what's active", async () => {
  const notReady = await shop();
  const calls = [];
  const stripe = {
    accounts: {
      async update(id, params) {
        calls.push({ id, params });
        return { capabilities: { card_payments: "active", affirm_payments: "active", klarna_payments: "pending" } };
      },
    },
  };
  await assert.rejects(setShopFinancing(notReady, true, stripe), FinancingRefused);
  assert.equal(calls.length, 0);

  const ready = await shop({ stripeConnectAccountId: `acct_${stamp()}`, stripeConnectChargesEnabled: true, stripeConnectDetailsSubmitted: true });
  const on = await setShopFinancing(ready, true, stripe);
  assert.deepEqual(calls[0].params.capabilities, { affirm_payments: { requested: true }, klarna_payments: { requested: true } });
  assert.equal(calls[0].id, ready.stripeConnectAccountId);
  assert.deepEqual(on, { enabled: true, active: ["affirm"], pending: ["klarna"] });

  const row = await prisma.business.findUnique({ where: { id: ready.id } });
  assert.deepEqual(checkoutPaymentMethods(row, 900_000), ["card", "affirm"], "pending Klarna never reaches checkout");

  await syncConnectAccount({ id: ready.stripeConnectAccountId, metadata: { businessId: ready.id }, charges_enabled: true, payouts_enabled: true, details_submitted: true, capabilities: { affirm_payments: "active", klarna_payments: "active" } });
  const later = await prisma.business.findUnique({ where: { id: ready.id } });
  assert.equal(later.financingMethods, "affirm,klarna", "Stripe's account webhook turns Klarna on when it clears");

  const off = await setShopFinancing(later, false, stripe);
  assert.equal(off.enabled, false);
  assert.deepEqual(financingFor(await prisma.business.findUnique({ where: { id: ready.id } }), 900_000), []);
});

test("pay links and estimates carry it through checkout and say it plainly", () => {
  for (const file of ["src/lib/invoice-pay.ts", "src/lib/estimate-pay.ts"]) {
    assert.match(read(file), /\.\.\.\(paymentMethods \? \{ payment_method_types: paymentMethods \} : \{\}\)/, file);
  }
  assert.match(read("src/app/api/public/invoice/[token]/route.ts"), /financingLine\(financingFor\(invoice\.business, invoice\.amountCents\)\)/);
  assert.match(read("src/app/api/public/estimate/[token]/route.ts"), /financingLine\(financingFor\(estimate\.business, estimate\.amountCents\)\)/);
  const route = read("src/app/api/connect/financing/route.ts");
  assert.match(route, /requirePermission\("billing\.manage"/);
  assert.doesNotMatch(route, /NextResponse\.json\(\{ error: error instanceof/);
  assert.match(read("src/components/connect-payouts-panel.tsx"), /state === "ready" \? <FinancingRow \/> : null/);
});
