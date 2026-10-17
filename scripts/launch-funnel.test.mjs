import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { getLaunchFunnel } = await import("../src/lib/launch-funnel.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the launch funnel counts the loop from records that already exist", async () => {
  const calls = [];
  const stub = {
    shopPreview: {
      count: async (args) => {
        calls.push(["preview", args]);
        return args?.where ? 3 : 10;
      },
    },
    callReplay: {
      count: async () => 4,
      aggregate: async () => ({ _sum: { views: 27 } }),
    },
    business: {
      count: async (args) => (args?.where ? 2 : 5),
    },
  };
  const cohort = async () => ({ capacity: 25, taken: 2, left: 23, month: "October" });
  const funnel = await getLaunchFunnel(stub, cohort);
  assert.deepEqual(funnel, {
    previewsStarted: 10,
    previewsCalled: 3,
    replaysShared: 4,
    replayViews: 27,
    shopsTotal: 5,
    shopsPaying: 2,
    cohort: { capacity: 25, taken: 2, left: 23, month: "October" },
  });
  assert.deepEqual(calls[1], ["preview", { where: { lastCallAt: { not: null } } }], "a preview counts as called only once a call landed");
});

test("the funnel readout is privileged and claims are honestly not counted", () => {
  const route = read("src/app/api/admin/launch-funnel/route.ts");
  assert.match(route, /isPrivilegedRequest/);
  assert.match(route, /status: 401/);
  const card = read("src/app/admin/page.tsx");
  assert.match(card, /LaunchFunnelCard/);
  assert.match(card, /Founding cohort, \{funnel\.cohort\.month\}/);
  assert.match(card, /are not\s+stored, so they are not counted here/);
});
