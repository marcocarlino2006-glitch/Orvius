/*
 * Number setup (docs/BACKLOG.md M7): every refusal happens before anything is
 * bought, and the automatic line check never buys a number for a shop that
 * has stopped paying.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "VAPI_API_KEY"]) delete process.env[key];

const { autoEnsureCustomerShopLine, ensureDedicatedShopLine, provisionBusiness, shopNeedsAutoLine } = await import(
  "../src/lib/provision-business.ts"
);

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
const needing = { slug: "cool-air", name: "Cool Air", vapiAssistantId: "asst_1", ownerPhone: "+15125550140", twilioPhone: null, vapiPhoneNumber: null };

const input = (email, extra = {}) => ({
  ownerEmail: email,
  name: "Fresh Air Co",
  ownerPhone: "+15125550141",
  trade: "HVAC",
  billing: { planId: "pro", customerId: "cus_x", subscriptionId: "sub_x" },
  ...extra,
});

test("a shop with an assistant and an owner phone but no line gets one; demo and canceled shops never do", () => {
  assert.equal(shopNeedsAutoLine({ ...needing, billingStatus: "active" }), true);
  assert.equal(shopNeedsAutoLine({ ...needing, billingStatus: "pilot" }), true);
  assert.equal(shopNeedsAutoLine({ ...needing, billingStatus: "past_due" }), true);
  assert.equal(shopNeedsAutoLine({ ...needing, billingStatus: "canceled" }), false, "a canceled shop whose number was released must not buy another");
  assert.equal(shopNeedsAutoLine({ ...needing, twilioPhone: "+15125550100", billingStatus: "active" }), false, "already has its own line");
  assert.equal(shopNeedsAutoLine({ ...needing, vapiAssistantId: null, billingStatus: "active" }), false);
  assert.equal(shopNeedsAutoLine({ ...needing, ownerPhone: null, billingStatus: "active" }), false);
  assert.equal(shopNeedsAutoLine({ ...needing, slug: "summit-hvac", billingStatus: "active" }), false, "the demo shop keeps the demo line");
});

test("opening the dashboard as a canceled shop with a released number buys nothing", async () => {
  const shop = await prisma.business.create({
    data: {
      name: "Lapsed Air",
      slug: `lapsed-${stamp()}`,
      ownerEmail: `lapsed-${stamp()}@example.test`,
      ownerPhone: "+15125550142",
      vapiAssistantId: "asst_left_behind",
      billingStatus: "canceled",
      lineReleasedAt: new Date(),
    },
  });
  try {
    const result = await autoEnsureCustomerShopLine(shop);
    assert.equal(result.provisioned, false);
    assert.equal(await prisma.provisionAttempt.count({ where: { key: { contains: shop.id } } }), 0);
  } finally {
    await drop(shop.id);
  }
});

test("a shop without an assistant, or with no way to buy a line, is refused without an attempt", async () => {
  const shop = await prisma.business.create({
    data: { name: "No Line Air", slug: `noline-${stamp()}`, ownerPhone: "+15125550143", billingStatus: "active" },
  });
  try {
    await assert.rejects(ensureDedicatedShopLine(shop), /not provisioned/);
    const withAssistant = await prisma.business.update({ where: { id: shop.id }, data: { vapiAssistantId: "asst_1" } });
    await assert.rejects(ensureDedicatedShopLine(withAssistant), /not available/);
    assert.equal(await prisma.provisionAttempt.count({ where: { key: { contains: shop.id } } }), 0);
  } finally {
    await drop(shop.id);
  }
});

test("onboarding refuses a second shop, a bad owner phone, or missing voice setup before buying anything", async () => {
  const email = `owner-${stamp()}@example.test`;
  const existing = await prisma.business.create({ data: { name: "Has One", slug: `hasone-${stamp()}`, ownerEmail: email } });
  try {
    await assert.rejects(provisionBusiness(input(email)), /already linked/);
  } finally {
    await drop(existing.id);
  }

  const fresh = `fresh-${stamp()}@example.test`;
  await assert.rejects(provisionBusiness(input(fresh, { ownerPhone: "12" })));
  await assert.rejects(provisionBusiness(input(fresh)), /Voice AI is not configured/);
  assert.equal(await prisma.business.count({ where: { ownerEmail: fresh } }), 0);
  assert.equal(await prisma.provisionAttempt.count({ where: { key: { contains: fresh } } }), 0, "no attempt, so nothing to buy or roll back");
});
