import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  NETWORK_DECLINED,
  networkForNewShop,
  neverChoseNetwork,
  resolveNetworkSave,
  turnOnNeverChosenShops,
} from "../src/lib/network-choice.ts";

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

test("a shop that never chose turns on when a ZIP is known, and an explicit off stays off", () => {
  const never = { networkOn: false, networkZip3: null };
  assert.equal(neverChoseNetwork(never), true);
  assert.deepEqual(resolveNetworkSave(never, { address: "12 Main St, Chicago, IL 60614", serviceZipsJson: "[]" }), {
    networkOn: true,
    networkZip3: "606",
  });
  assert.deepEqual(resolveNetworkSave(never, { address: "12 Main St", serviceZipsJson: "[]" }), {
    networkOn: false,
    networkZip3: null,
  });
  assert.deepEqual(resolveNetworkSave(never, { networkOn: false, address: "12 Main St, Chicago, IL 60614", serviceZipsJson: "[]" }), {
    networkOn: false,
    networkZip3: NETWORK_DECLINED,
  });

  const declined = { networkOn: false, networkZip3: NETWORK_DECLINED };
  assert.equal(neverChoseNetwork(declined), false);
  assert.deepEqual(resolveNetworkSave(declined, { address: "12 Main St, Chicago, IL 60614", serviceZipsJson: "[]" }), {
    networkOn: false,
    networkZip3: NETWORK_DECLINED,
  });

  const choseOff = { networkOn: false, networkZip3: "606" };
  assert.deepEqual(resolveNetworkSave(choseOff, { address: "9 Oak, Chicago, IL 60614", serviceZipsJson: "[]" }), {
    networkOn: false,
    networkZip3: "606",
  });
  assert.equal(resolveNetworkSave(choseOff, { networkOn: true, address: null, serviceZipsJson: "[]" }).error, undefined);
  assert.equal(resolveNetworkSave(never, { networkOn: true, address: null, serviceZipsJson: "[]" }).error?.length > 0, true);

  assert.deepEqual(networkForNewShop("100 King St, Austin, TX 78701"), { networkOn: true, networkZip3: "787" });
  assert.deepEqual(networkForNewShop(null), { networkOn: true, networkZip3: null });
});

test("shops that never chose and have a ZIP are turned on, and an explicit off is not", async () => {
  const ready = await prisma.business.create({
    data: {
      name: "Ready Heat",
      slug: `net-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      servicesJson: "[]",
      environment: "test",
      address: "1 Lake, Chicago, IL 60614",
      networkOn: false,
      networkZip3: null,
    },
  });
  const declined = await prisma.business.create({
    data: {
      name: "Declined Heat",
      slug: `net-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      servicesJson: "[]",
      environment: "test",
      address: "2 Lake, Chicago, IL 60614",
      networkOn: false,
      networkZip3: NETWORK_DECLINED,
    },
  });
  const choseOff = await prisma.business.create({
    data: {
      name: "Off Heat",
      slug: `net-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      servicesJson: "[]",
      environment: "test",
      address: "3 Lake, Chicago, IL 60614",
      networkOn: false,
      networkZip3: "606",
    },
  });
  const noZip = await prisma.business.create({
    data: {
      name: "No Zip Heat",
      slug: `net-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      servicesJson: "[]",
      environment: "test",
      address: "somewhere",
      networkOn: false,
      networkZip3: null,
    },
  });
  made.push(ready.id, declined.id, choseOff.id, noZip.id);

  const turned = await turnOnNeverChosenShops();
  assert.ok(turned >= 1);
  assert.equal((await prisma.business.findUnique({ where: { id: ready.id } })).networkOn, true);
  assert.equal((await prisma.business.findUnique({ where: { id: ready.id } })).networkZip3, "606");
  assert.equal((await prisma.business.findUnique({ where: { id: declined.id } })).networkOn, false);
  assert.equal((await prisma.business.findUnique({ where: { id: choseOff.id } })).networkOn, false);
  assert.equal((await prisma.business.findUnique({ where: { id: choseOff.id } })).networkZip3, "606");
  assert.equal((await prisma.business.findUnique({ where: { id: noZip.id } })).networkOn, false);
  assert.equal((await prisma.business.findUnique({ where: { id: noZip.id } })).networkZip3, null);
});
