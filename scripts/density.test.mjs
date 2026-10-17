import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { getDensity, metroFromAddress } = await import("../src/lib/density.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("metro is read from the address tail and never guessed", () => {
  assert.equal(metroFromAddress("1200 Congress Ave, Austin, TX 78701"), "Austin");
  assert.equal(metroFromAddress("9 Pine St, Reno, NV"), "Reno");
  assert.equal(metroFromAddress("Rural route 4"), "Metro not set");
  assert.equal(metroFromAddress(null), "Metro not set");
  assert.equal(metroFromAddress(""), "Metro not set");
});

test("density counts production shops by trade and metro, densest first", async () => {
  const seen = [];
  const client = {
    business: {
      findMany: async (args) => {
        seen.push(args);
        return [
          { trade: "HVAC", address: "1 A St, Austin, TX 78701" },
          { trade: "HVAC", address: "2 B St, Austin, TX 78704" },
          { trade: "HVAC", address: "3 C St, Dallas, TX 75201" },
          { trade: "Plumbing", address: "4 D St, Austin, TX 78701" },
          { trade: null, address: null },
        ];
      },
    },
  };
  const density = await getDensity(client);
  assert.deepEqual(seen, [{ where: { environment: "production" }, select: { trade: true, address: true } }]);
  assert.equal(density.total, 5);
  assert.equal(density.metros, 2);
  assert.deepEqual(density.densest, { trade: "HVAC", metro: "Austin", shops: 2 });
  assert.equal(density.concentrated, false, "2 shops is a leading cell, not density");
  assert.deepEqual(density.rows[0], { trade: "HVAC", metro: "Austin", shops: 2 });
  assert.match(read("src/app/api/admin/density/route.ts"), /isPrivilegedRequest/);
  assert.match(read("src/app/admin/page.tsx"), /DensityCard/);
});
