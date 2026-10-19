import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { getReactivationValue } = await import("../src/lib/reactivation-value.ts");
const { getPaymentsAttach } = await import("../src/lib/payments-attach.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("reactivation value sizes the dormant audience at the owner's ticket", async () => {
  const sizes = { 3: 9, 6: 5, 12: 2 };
  const value = await getReactivationValue(
    "shop-1",
    async (_id, months) => Array.from({ length: sizes[months] }),
    { business: { findUnique: async () => ({ avgTicketCents: 40000 }) } },
  );
  assert.deepEqual(value, {
    audience3: 9,
    audience6: 5,
    audience12: 2,
    avgTicketCents: 40000,
    estimatedCents: 200000,
  });
  const noTicket = await getReactivationValue("shop-1", async () => [], {
    business: { findUnique: async () => ({ avgTicketCents: null }) },
  });
  assert.equal(noTicket.estimatedCents, null, "no ticket, no invented prize");
});

test("payments attach counts kept money through Orvius for production shops only", async () => {
  const seen = [];
  const client = {
    business: {
      findMany: async (args) => {
        seen.push(args);
        return [{ id: "a" }, { id: "b" }];
      },
    },
    payment: {
      findMany: async () => [
        { businessId: "a", amountCents: 10000, refundedCents: 1000 },
        { businessId: "a", amountCents: 5000, refundedCents: 0 },
      ],
    },
    deposit: { findMany: async () => [{ businessId: "b", amountCents: 2000, refundedCents: 0 }] },
    invoice: { findMany: async () => [{ amountCents: 7000 }, { amountCents: 3000 }] },
  };
  const attach = await getPaymentsAttach(client);
  assert.deepEqual(seen, [{ where: { environment: "production" }, select: { id: true } }]);
  assert.deepEqual(attach, {
    productionShops: 2,
    shopsCollecting: 2,
    collectedKeptCents: 16000,
    openBilledCents: 10000,
  });
  assert.match(read("src/app/api/admin/payments-attach/route.ts"), /isPrivilegedRequest/);
  assert.match(read("src/app/admin/page.tsx"), /PaymentsAttachCard/);
});
