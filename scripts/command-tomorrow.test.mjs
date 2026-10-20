import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { getCommandTomorrow } = await import("../src/lib/command-tomorrow.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("command tomorrow counts tomorrow's open jobs and the dormant prize", async () => {
  const seen = [];
  const client = {
    business: { findUnique: async () => ({ timezone: "America/Chicago", avgTicketCents: 20000 }) },
    job: {
      findMany: async (args) => {
        seen.push(args);
        return [
          { technicianId: "t1", scheduledAt: new Date("2026-10-19T13:00:00Z") },
          { technicianId: null, scheduledAt: new Date("2026-10-19T15:00:00Z") },
          { technicianId: "t2", scheduledAt: null },
        ];
      },
    },
  };
  const tomorrow = await getCommandTomorrow("shop-1", new Date("2026-10-18T18:00:00Z"), client, async () => [1, 2, 3]);
  assert.equal(tomorrow.jobCount, 3);
  assert.equal(tomorrow.unassigned, 1);
  assert.equal(tomorrow.firstJobAt, "2026-10-19T13:00:00.000Z");
  assert.equal(tomorrow.dormantCustomers, 3);
  assert.equal(tomorrow.dormantEstimatedCents, 60000);
  assert.deepEqual(seen[0].where.status, { notIn: ["completed", "cancelled"] });
  assert.ok(seen[0].where.scheduledAt.gte instanceof Date && seen[0].where.scheduledAt.lt > seen[0].where.scheduledAt.gte);
});

test("tomorrow is still read for the shop, and Command does not turn it into a second strip", () => {
  assert.match(read("src/app/api/ring1/route.ts"), /getCommandTomorrow\(business\.id, now\)/);
  assert.match(read("src/lib/command-tomorrow.ts"), /dormantCustomers/);
  assert.doesNotMatch(read("src/components/ring1-command-center.tsx"), /AheadStrip|Dormant customers/);
});
