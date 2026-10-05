/*
 * Every shop gets its own number, wired to its own receptionist, at platform
 * scale. Signs up more shops than one page of Vapi's number list holds, with a
 * fake Twilio and a fake Vapi standing in for the real accounts, then checks
 * that each shop's line is distinct, answered by that shop's assistant, routed
 * back to that shop, and can be suspended — including shops past the first 100.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "test-token";
process.env.VAPI_API_KEY = "vapi-test";

const SHOPS = 130;
const twilio = { owned: new Map(), next: 1000, purchases: 0 };
mock.module("twilio", {
  defaultExport: () => {
    const incomingPhoneNumbers = (sid) => ({
      update: async () => ({ sid }),
      remove: async () => {
        for (const [n, e] of twilio.owned) if (e.sid === sid) twilio.owned.delete(n);
      },
    });
    incomingPhoneNumbers.list = async ({ phoneNumber, friendlyName }) =>
      [...twilio.owned.values()].filter((e) => (phoneNumber ? e.phoneNumber === phoneNumber : e.friendlyName === friendlyName)).slice(0, 1);
    incomingPhoneNumbers.create = async ({ phoneNumber, friendlyName }) => {
      if (twilio.owned.has(phoneNumber)) throw new Error("number no longer available");
      twilio.purchases += 1;
      const entry = { sid: `PN${twilio.purchases}`, phoneNumber, friendlyName };
      twilio.owned.set(phoneNumber, entry);
      return entry;
    };
    return {
      incomingPhoneNumbers,
      availablePhoneNumbers: () => ({
        local: {
          list: async ({ areaCode, limit = 3 }) =>
            Array.from({ length: limit }, () => ({ phoneNumber: `+1${areaCode ?? 303}555${String(twilio.next++).padStart(4, "0")}` })),
        },
      }),
    };
  },
});

const vapi = { numbers: [], assistants: new Map(), seq: 0, lists: 0 };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.host !== "api.vapi.ai") return realFetch(input, init);
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(init.body) : {};
  const json = (data) => new Response(JSON.stringify(data ?? {}), { status: 200, headers: { "content-type": "application/json" } });
  const [, kind, id] = url.pathname.split("/");
  if (kind === "assistant") {
    if (method === "POST") {
      const a = { id: `asst_${++vapi.seq}`, ...body };
      vapi.assistants.set(a.id, a);
      return json(a);
    }
    if (method === "PATCH") return json(Object.assign(vapi.assistants.get(id) ?? { id }, body));
    if (method === "DELETE") return json(vapi.assistants.delete(id));
    return json(vapi.assistants.get(id) ?? { id });
  }
  if (kind === "phone-number") {
    if (method === "GET" && !id) {
      vapi.lists += 1;
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const before = url.searchParams.get("createdAtLt");
      // Newest first, at most `limit`, like the real list.
      const rows = [...vapi.numbers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter((n) => !before || n.createdAt < before);
      return json(rows.slice(0, Math.min(limit, 100)));
    }
    if (method === "POST") {
      const n = { id: `pn_${++vapi.seq}`, createdAt: new Date(Date.UTC(2026, 0, 1) + vapi.seq * 1000).toISOString(), ...body };
      vapi.numbers.push(n);
      return json(n);
    }
    const entry = vapi.numbers.find((n) => n.id === id);
    if (method === "PATCH") return json(Object.assign(entry, body));
    if (method === "DELETE") {
      vapi.numbers = vapi.numbers.filter((n) => n.id !== id);
      return json({});
    }
  }
  return json({});
};

const prisma = createScriptPrisma();
const stamp = Date.now();
const emails = Array.from({ length: SHOPS }, (_, i) => `scale-${stamp}-${i}@orvius.test`);

test(`${SHOPS} signups each get their own number on their own receptionist`, { timeout: 300_000 }, async () => {
  const { provisionBusiness, ensureDedicatedShopLine } = await import("../src/lib/provision-business.ts");
  const { resolveBusinessByInboundPhone } = await import("../src/lib/resolve-shop-line.ts");
  const { suspendShopLine } = await import("../src/lib/line-lifecycle.ts");
  try {
    const shops = [];
    for (const [i, email] of emails.entries()) {
      const { business } = await provisionBusiness({
        name: `Scale Shop ${stamp} ${i}`,
        trade: "HVAC",
        ownerEmail: email,
        ownerPhone: `+1${["312", "512", "602", "212"][i % 4]}8${String(stamp).slice(-2)}${String(i).padStart(4, "0")}`,
        billing: { customerId: `cus_${i}`, subscriptionId: `sub_${i}`, planId: "starter" },
      });
      shops.push(business);
    }

    const lines = shops.map((s) => s.vapiPhoneNumber);
    assert.equal(new Set(lines).size, SHOPS, "no two shops share a number");
    assert.ok(lines.every((l, i) => l && l === shops[i].twilioPhone), "Twilio and Vapi agree on each shop's number");
    assert.equal(twilio.purchases, SHOPS, "one purchase per shop");
    assert.ok(vapi.numbers.length > 100, "more numbers than one page of Vapi's list");

    for (const shop of shops) {
      const entries = vapi.numbers.filter((n) => n.number === shop.vapiPhoneNumber);
      assert.equal(entries.length, 1, `${shop.vapiPhoneNumber} imported once`);
      assert.equal(entries[0].assistantId, shop.vapiAssistantId, "answered by its own shop's receptionist");
    }
    assert.equal(new Set(shops.map((s) => s.vapiAssistantId)).size, SHOPS, "every shop has its own receptionist");

    for (const shop of [shops[0], shops[57], shops.at(-1)]) {
      assert.equal((await resolveBusinessByInboundPhone(shop.vapiPhoneNumber))?.id, shop.id, "a call to the line reaches that shop");
    }

    // The oldest shop sits past the first page of Vapi's list.
    const oldest = shops[0];
    await ensureDedicatedShopLine(oldest);
    assert.equal(vapi.numbers.filter((n) => n.number === oldest.vapiPhoneNumber).length, 1, "a repair does not import a second copy");
    assert.equal(await suspendShopLine(oldest), true, "a canceled shop's line stops answering");
    assert.equal(vapi.numbers.find((n) => n.number === oldest.vapiPhoneNumber).assistantId, null);
    assert.equal(vapi.numbers.find((n) => n.number === shops[1].vapiPhoneNumber).assistantId, shops[1].vapiAssistantId, "only that shop");
  } finally {
    await prisma.business.deleteMany({ where: { ownerEmail: { in: emails } } }).catch(() => {});
  }
});

test("a double-clicked checkout makes one shop with one number", { timeout: 60_000 }, async () => {
  const { provisionBusiness } = await import("../src/lib/provision-business.ts");
  const email = `double-${stamp}@orvius.test`;
  const before = twilio.purchases;
  const input = {
    name: `Double Shop ${stamp}`,
    trade: "Plumbing",
    ownerEmail: email,
    ownerPhone: `+1415870${String(stamp).slice(-4)}`,
    billing: { customerId: "cus_d", subscriptionId: "sub_d", planId: "starter" },
  };
  try {
    const results = await Promise.allSettled([provisionBusiness(input), provisionBusiness(input)]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await prisma.business.count({ where: { ownerEmail: email } }), 1);
    assert.equal(twilio.purchases - before, 1, "one number bought");
  } finally {
    await prisma.business.deleteMany({ where: { ownerEmail: email } }).catch(() => {});
  }
});
