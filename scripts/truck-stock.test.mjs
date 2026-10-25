import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { cleanOnTruck, priceBook, setJobLines } from "../src/lib/job-field.ts";
import { checkTruck } from "../src/lib/truck-stock.ts";

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test("a part is counted only when the shop counted it, and a job moves that count", async () => {
  assert.equal(cleanOnTruck("part", ""), null);
  assert.equal(cleanOnTruck("part", 2), 2);
  assert.equal(cleanOnTruck("service", 4), null);
  assert.throws(() => cleanOnTruck("part", 1.5), /whole number/);

  const shop = await prisma.business.create({
    data: { name: "Parts HVAC", slug: `truck-${stamp()}`, trade: "HVAC", hoursJson: "{}", servicesJson: "[]", environment: "test" },
  });
  made.push(shop.id);
  const capacitor = await prisma.priceBookItem.create({
    data: { businessId: shop.id, name: "Capacitor", kind: "part", unitCents: 1800 },
  });
  const visit = await prisma.priceBookItem.create({
    data: { businessId: shop.id, name: "Diagnostic", kind: "service", unitCents: 8900 },
  });
  await prisma.partStock.create({ data: { priceBookItemId: capacitor.id, businessId: shop.id, onTruck: 3 } });
  const customer = await prisma.customer.create({
    data: { businessId: shop.id, name: "Ann", phone: "+15555550100", phoneNormalized: "+15555550100" },
  });
  const job = await prisma.job.create({ data: { businessId: shop.id, customerId: customer.id, title: "No cool", status: "scheduled" } });

  assert.match(await checkTruck(shop.id, "capacitor"), /Capacitor: 3 on the truck/);
  assert.match(await checkTruck(shop.id, "contactor"), /Nothing named "contactor"/);

  await setJobLines(shop.id, job.id, [{ name: "Capacitor", kind: "part", quantity: 2, unitCents: 1800, priceBookItemId: capacitor.id }]);
  assert.equal((await prisma.partStock.findUnique({ where: { priceBookItemId: capacitor.id } })).onTruck, 1);

  await setJobLines(shop.id, job.id, [
    { name: "Capacitor", kind: "part", quantity: 2, unitCents: 1800, priceBookItemId: capacitor.id },
    { name: "Diagnostic", kind: "service", quantity: 1, unitCents: 8900, priceBookItemId: visit.id },
  ]);
  assert.equal((await prisma.partStock.findUnique({ where: { priceBookItemId: capacitor.id } })).onTruck, 1);

  await setJobLines(shop.id, job.id, []);
  assert.equal((await prisma.partStock.findUnique({ where: { priceBookItemId: capacitor.id } })).onTruck, 3);

  await setJobLines(shop.id, job.id, [{ name: "Capacitor", kind: "part", quantity: 8, unitCents: 1800, priceBookItemId: capacitor.id }]);
  assert.equal((await prisma.partStock.findUnique({ where: { priceBookItemId: capacitor.id } })).onTruck, 0);
  assert.match(await checkTruck(shop.id, "Capacitor"), /0 on the truck/);

  const uncounted = await prisma.priceBookItem.create({
    data: { businessId: shop.id, name: "Contactor", kind: "part", unitCents: 2400 },
  });
  assert.match(await checkTruck(shop.id, "Contactor"), /not counted/);
  await setJobLines(shop.id, job.id, [
    { name: "Capacitor", kind: "part", quantity: 8, unitCents: 1800, priceBookItemId: capacitor.id },
    { name: "Contactor", kind: "part", quantity: 1, unitCents: 2400, priceBookItemId: uncounted.id },
  ]);
  assert.equal(await prisma.partStock.findUnique({ where: { priceBookItemId: uncounted.id } }), null);
  assert.equal((await prisma.partStock.findUnique({ where: { priceBookItemId: capacitor.id } })).onTruck, 0);

  const book = await priceBook(shop.id);
  assert.equal(book.find((item) => item.name === "Capacitor").onTruck, 0);
  assert.equal(book.find((item) => item.name === "Contactor").onTruck, null);
  assert.equal(book.find((item) => item.name === "Diagnostic").onTruck, null);
});
