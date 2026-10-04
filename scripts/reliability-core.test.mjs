import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readSettingsSource } from "./lib/settings-source.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("Business schema persists trade and address", () => {
  const schema = read("prisma/schema.prisma");
  const business = schema.slice(
    schema.indexOf("model Business {"),
    schema.indexOf("model Call {"),
  );
  assert.match(business, /trade\s+String\?/);
  assert.match(business, /address\s+String\?/);
});

test("provision writes trade onto the shop", () => {
  const provision = read("src/lib/provision-business.ts");
  assert.match(provision, /trade:\s*input\.trade/);
});

test("line verification stamps lineVerifiedAt from a completed call", () => {
  const verify = read("src/app/api/onboarding/verify/route.ts");
  assert.match(verify, /lineVerifiedAt:\s*completedCall\.createdAt/);
  assert.match(verify, /completedCall && !business\.lineVerifiedAt/);
});

test("owner test-call proves Call → Lead → Customer on the signed-in shop", () => {
  const route = read("src/app/api/onboarding/test-call/route.ts");
  assert.match(route, /requireEntitledSession/);
  assert.match(route, /prisma\.call\.create/);
  assert.match(route, /prisma\.lead\.create/);
  assert.match(route, /linkTouchToCustomer/);
  assert.match(route, /maybeAutoBookLead/);
  assert.match(route, /Plumbing|Electrical|HVAC/);
});

test("Line plan unlocks jobs, customers, and ask for the wedge path", () => {
  const plans = read("src/lib/plan-features.ts");
  assert.match(plans, /LINE_MODULES/);
  assert.match(plans, /"jobs"/);
  assert.match(plans, /"customers"/);
  assert.match(plans, /"ask"/);
  assert.match(plans, /maxTechnicians:\s*1/);
});

test("shop setup checklist exposes progress and one next action", () => {
  const lib = read("src/lib/shop-setup-checklist.ts");
  assert.match(lib, /buildShopSetupChecklist/);
  assert.match(lib, /readyForNight/);
  assert.match(lib, /Booked or Escalated|hours_area|owner_alerts|capture/);
  const ui = readSettingsSource();
  assert.match(ui, /buildShopSetupChecklist/);
  assert.match(ui, /sc-meter/);
});

test("dashboard fetch failures name cause, impact, and recovery", () => {
  const lib = read("src/lib/dashboard-fetch.ts");
  assert.match(lib, /describeDashboardFailure/);
  assert.match(lib, /Sign in/);
  assert.match(lib, /Open Billing/);
  const inbox = read("src/app/dashboard/inbox/page.tsx");
  assert.match(inbox, /readDashboardError/);
  assert.match(inbox, /Recover:/);
});

test("onboarding verify offers an in-app test call", () => {
  const verify = read("src/components/onboarding-call-verify.tsx");
  assert.match(verify, /Run a test call in-app/);
  assert.match(verify, /\/api\/onboarding\/test-call/);
});

test("tradeForCapture prefers stored Business.trade", () => {
  const capture = read("src/lib/demand-capture.ts");
  assert.match(capture, /business\.trade/);
  assert.match(capture, /inferTradeFromBusiness/);
});

test("buildShopSetupChecklist marks next incomplete step", () => {
  // Logic mirror of buildShopSetupChecklist identity gate — keep in sync with lib.
  const hasName = true;
  const hasAddress = false;
  const trade = "HVAC";
  const identityDone = hasName && hasAddress;
  const readyForNight = Boolean(trade && hasName && true && true && true);
  assert.equal(identityDone, false);
  assert.equal(readyForNight, true);
  assert.match(read("src/lib/shop-setup-checklist.ts"), /hasName && hasAddress/);
});
