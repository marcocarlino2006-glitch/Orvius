/*
 * The customer is the record a shop cannot leave: texts belong on the person,
 * extra addresses and equipment stay with them, and a failed text shows as failed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const { parseAddresses, parseEquipment, serializeAddresses, serializeEquipment } = await import("../src/lib/customer-record.ts");
const { getCustomerTimeline } = await import("../src/lib/customer.ts");

const prisma = new PrismaClient();

test("junk JSON is an empty list, not a crash", () => {
  assert.deepEqual(parseAddresses("nope"), []);
  assert.deepEqual(parseEquipment(""), []);
  assert.equal(serializeAddresses([{ label: "Rental", line: "  9 Oak  " }]), JSON.stringify([{ label: "Rental", line: "9 Oak" }]));
  assert.equal(JSON.parse(serializeEquipment([{ name: "Furnace", brand: "Carrier", model: "", notes: "" }]))[0].name, "Furnace");
});

test("the customer history includes texts, and a failed one says it didn't arrive", async () => {
  const shop = await prisma.business.create({
    data: { name: "Record HVAC", slug: `rec-${Date.now()}`, environment: "test", trade: "HVAC", billingStatus: "active", billingPlan: "pro" },
  });
  try {
    const customer = await prisma.customer.create({
      data: {
        businessId: shop.id,
        name: "Nora Walsh",
        phone: "+13125550153",
        phoneNormalized: "+13125550153",
        address: "311 Lake St",
        addressesJson: serializeAddresses([{ label: "Rental", line: "88 Pine" }]),
        equipmentJson: serializeEquipment([{ name: "Furnace", brand: "Carrier", model: "58C", notes: "" }]),
      },
    });
    await prisma.message.createMany({
      data: [
        { businessId: shop.id, phoneNormalized: "+13125550153", direction: "out", author: "orvius", body: "Confirming tomorrow at 10.", deliveryStatus: "delivered", sid: `SM-ok-${customer.id}` },
        { businessId: shop.id, phoneNormalized: "+13125550153", direction: "out", author: "orvius", body: "On my way.", deliveryStatus: "failed", sid: `SM-fail-${customer.id}` },
        { businessId: shop.id, phoneNormalized: "+13125550153", direction: "in", author: "customer", body: "Gate code 4411", sid: `SM-in-${customer.id}` },
      ],
    });
    const timeline = await getCustomerTimeline(customer.id);
    const texts = timeline.filter((e) => e.type === "text");
    assert.equal(texts.length, 3);
    assert.ok(texts.some((e) => e.title.includes("didn't arrive") && e.status === "failed"));
    assert.ok(texts.some((e) => e.title === "They texted" && e.summary?.includes("Gate code")));
    assert.ok(texts.every((e) => e.href?.includes("messages")));
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("an old per-job tech link sends the technician into their day", () => {
  const page = readFileSync(new URL("../src/app/t/[token]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /redirect\(`\/tech\/\$\{appToken\}\/jobs\/\$\{job\.id\}`\)/);
  assert.match(page, /ensureTechAppToken/);
});
