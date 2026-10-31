#!/usr/bin/env node
/*
 * A customer the shop knows is asked "Is this Dana?" in the first sentence,
 * the recording notice still said, and only when the lookup answers inside
 * the ring budget. Anything that isn't a name gets the shop's usual greeting.
 */
import assert from "node:assert/strict";
import { after as afterAll, mock, test } from "node:test";

const nextServer = await import("next/server");
mock.module("next/server", {
  namedExports: { ...nextServer, after: () => {} },
});
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => null, signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const { prisma } = await import("../src/lib/prisma.ts");
const { greetableFirstName, returningOpening, loadReturningOpening, withinBudget, LATE } = await import("../src/lib/caller-context.ts");
const { openingWithNotice } = await import("../src/lib/vapi.ts");
const { POST } = await import("../src/app/api/webhooks/vapi/route.ts");

const uid = () => Math.random().toString(36).slice(2, 10);
const made = [];
afterAll(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test("only a real first name is said out loud", () => {
  assert.equal(greetableFirstName("Dana Reyes"), "Dana");
  assert.equal(greetableFirstName("José"), "José");
  assert.equal(greetableFirstName("Mary-Kate O'Neil"), "Mary-Kate");
  for (const junk of [null, "", "unknown", "Unknown caller", "Customer", "N/A", "Mr. Smith", "dana", "D", "555-0199", "ACME Plumbing", "Lakeview Property Management", "Sunrise Apartments LLC"]) {
    assert.equal(greetableFirstName(junk), null, String(junk));
  }
});

test("the greeting keeps the recording notice and swaps only the closing question", () => {
  const opening = openingWithNotice("Thank you for calling Pipe Pros. How can I help you today?", "Pipe Pros");
  const named = returningOpening(opening, "Dana");
  assert.match(named, /^Thank you for calling Pipe Pros\. This call may be recorded/);
  assert.match(named, /Is this Dana\?$/);
  assert.doesNotMatch(named, /How can I help/);
  assert.equal(returningOpening("Pipe Pros, recorded automated line", "Dana"), "Pipe Pros, recorded automated line Is this Dana?");
});

async function shopWithCaller(name) {
  const shop = await prisma.business.create({
    data: {
      name: `Greet ${uid()}`,
      slug: `greet-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      billingStatus: "active",
      billingPlan: "pro",
      twilioPhone: `+1720${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      vapiAssistantId: `asst_${uid()}`,
      lineVerifiedAt: new Date(),
    },
  });
  made.push(shop.id);
  const phone = `+1303${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  await prisma.customer.create({ data: { businessId: shop.id, name, phone, phoneNormalized: phone, interactionCount: 3 } });
  return { shop, phone };
}

test("a known caller's first sentence asks for them by name; a stranger hears the usual greeting", async () => {
  const { shop, phone } = await shopWithCaller("Dana Reyes");
  const ask = async (caller) =>
    (
      await POST(
        new Request("http://localhost/api/webhooks/vapi", {
          method: "POST",
          headers: { "content-type": "application/json", "x-vapi-secret": process.env.VAPI_WEBHOOK_SECRET ?? "" },
          body: JSON.stringify({ message: { type: "assistant-request", call: { id: `ar-${uid()}`, phoneNumber: { number: shop.twilioPhone }, customer: { number: caller } } } }),
        }),
      )
    ).json();
  const known = await ask(phone);
  assert.equal(known.assistantId, shop.vapiAssistantId);
  assert.match(known.assistantOverrides.firstMessage, new RegExp(`^Thank you for calling ${shop.name}\\. This call may be recorded.*Is this Dana\\?$`));

  const stranger = await ask("+13035550100");
  assert.deepEqual(stranger, { assistantId: shop.vapiAssistantId });
});

test("a slow lookup gives up inside the budget and the caller gets the usual greeting", async () => {
  const { shop, phone } = await shopWithCaller("Dana Reyes");
  assert.match(await loadReturningOpening({ businessId: shop.id, phone, opening: "Hi. How can I help?" }), /Is this Dana\?$/);
  const started = Date.now();
  const slow = new Promise((resolve) => setTimeout(() => resolve("Dana"), 600));
  assert.equal(await withinBudget(slow, 150), LATE);
  assert.ok(Date.now() - started < 300, "the caller is not kept ringing for a slow database");
  assert.equal(await withinBudget(Promise.reject(new Error("db down")), 150), null);
  assert.equal(await withinBudget(Promise.resolve("Dana"), 150), "Dana");
  const junk = await shopWithCaller("Unknown");
  assert.equal(await loadReturningOpening({ businessId: junk.shop.id, phone: junk.phone, opening: "Hi. How can I help?" }), null);
});
