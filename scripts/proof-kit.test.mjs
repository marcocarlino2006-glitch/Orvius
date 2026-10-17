import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { getProofKit } = await import("../src/lib/proof-kit.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the proof kit joins one shop's outcomes, proof text and listed replays only", async () => {
  const seen = [];
  const client = {
    business: {
      findUnique: async (args) => {
        seen.push(["business", args]);
        return { id: "shop-1", name: "Al's Air", trade: "HVAC", slug: "als-air" };
      },
    },
    galleryCall: {
      findMany: async (args) => {
        seen.push(["gallery", args]);
        return [{ id: "gal12345678", views: 9, trade: "HVAC" }];
      },
    },
  };
  const outcomes = { windowDays: 7, calls: 12, leads: 8, jobsBooked: 5, bookingRate: 63, collectedCents: 42000 };
  const kit = await getProofKit("shop-1", {
    client,
    outcomes: async () => outcomes,
    proof: (o, name) => `proof for ${name}: ${o.calls} calls`,
    reactivation: async () => ({ audience3: 4, audience6: 3, audience12: 2, avgTicketCents: 30000, estimatedCents: 90000 }),
  });
  assert.equal(kit.reactivation.estimatedCents, 90000);
  assert.equal(kit.shop.name, "Al's Air");
  assert.equal(kit.outcomes, outcomes);
  assert.equal(kit.proofText, "proof for Al's Air: 12 calls");
  assert.deepEqual(kit.replays, [{ id: "gal12345678", href: "/calls/gal12345678", views: 9, trade: "HVAC" }]);
  assert.deepEqual(seen[1][1].where, { businessId: "shop-1", status: "listed" }, "only listed replays are proof");
});

test("an unknown shop has no proof kit, and the route stays privileged", async () => {
  const client = {
    business: { findUnique: async () => null },
    galleryCall: { findMany: async () => [] },
  };
  assert.equal(
    await getProofKit("nope", { client, outcomes: async () => ({}), reactivation: async () => ({}) }),
    null,
  );
  const route = read("src/app/api/admin/proof-kit/route.ts");
  assert.match(route, /isPrivilegedRequest/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 400/);
  assert.match(route, /status: 404/);
  assert.match(read("src/app/admin/page.tsx"), /ProofKitCard/);
});
