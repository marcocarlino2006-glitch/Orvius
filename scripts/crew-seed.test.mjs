import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { ensureCrew, listCrew } from "../src/lib/field.ts";

const prisma = new PrismaClient();

async function newShop(label) {
  return prisma.business.create({
    data: {
      name: label,
      slug: `${label.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}`,
      ownerPhone: "+15555550123",
      billingStatus: "pilot",
    },
  });
}

test("a shop's first two requests seed one owner, not two", async () => {
  const business = await newShop("Crew Race Proof");

  try {
    /*
      This is the dispatch page, not a contrived case: it fetches the board and
      the crew at the same moment and both paths call ensureCrew. Before the
      unique on (businessId, name) both reads found an empty table, both wrote,
      and the board drew the owner twice.
    */
    const [first, second] = await Promise.all([
      ensureCrew(business.id),
      ensureCrew(business.id),
    ]);

    assert.equal(
      await prisma.technician.count({ where: { businessId: business.id } }),
      1,
      "one owner row exists after two concurrent seeds",
    );
    assert.equal(
      first[0].id,
      second[0].id,
      "both callers are handed the same technician",
    );
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a crew member cannot be added twice under one name", async () => {
  const business = await newShop("Crew Name Proof");

  try {
    await prisma.technician.create({
      data: { businessId: business.id, name: "Ray Delgado", phone: "+15555550141" },
    });

    await assert.rejects(
      prisma.technician.create({
        data: { businessId: business.id, name: "Ray Delgado", phone: "+15555550999" },
      }),
      /Unique constraint/,
      "the database refuses a second Ray rather than leaving two on the board",
    );

    /* The same name on a different shop is a different person. */
    const other = await newShop("Crew Name Neighbour");
    try {
      await prisma.technician.create({
        data: { businessId: other.id, name: "Ray Delgado", phone: "+15555550141" },
      });
      assert.equal(
        await prisma.technician.count({
          where: {
            name: "Ray Delgado",
            businessId: { in: [business.id, other.id] },
          },
        }),
        2,
        "the constraint is scoped to the shop, not global",
      );
    } finally {
      await prisma.business.delete({ where: { id: other.id } }).catch(() => {});
    }
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("an owner who leaves the crew is not re-seeded on the next load", async () => {
  const business = await newShop("Crew Opt Out Proof");

  try {
    const [seeded] = await ensureCrew(business.id);
    await prisma.technician.update({
      where: { id: seeded.id },
      data: { isActive: false },
    });

    assert.deepEqual(
      await listCrew(business.id),
      [],
      "the crew stays empty once the only member has stood down",
    );
    assert.equal(
      await prisma.technician.count({ where: { businessId: business.id } }),
      1,
      "and no replacement row is written behind their back",
    );
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test.after(() => prisma.$disconnect());
