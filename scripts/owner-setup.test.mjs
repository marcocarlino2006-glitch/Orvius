import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getOwnerSetupStatus,
  ownerSetupHref,
} from "../src/lib/owner-setup-state.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const base = {
  twilioPhone: "+15551234001",
  vapiPhoneNumber: "+15551234001",
  ownerPhone: "+15559876543",
  overflowForwardConfirmedAt: null,
  lineVerifiedAt: null,
};

test("setup requires real line proof before capture confirmation", () => {
  assert.equal(getOwnerSetupStatus(base).nextStep, "verify");
  assert.equal(
    getOwnerSetupStatus({ ...base, lineVerifiedAt: new Date() }).nextStep,
    "capture",
  );
  assert.equal(
    getOwnerSetupStatus({
      ...base,
      lineVerifiedAt: new Date(),
      overflowForwardConfirmedAt: new Date(),
    }).ready,
    true,
  );
});

test("recovery links resume the guided setup ritual", () => {
  assert.equal(ownerSetupHref("line"), "/dashboard/onboarding");
  assert.equal(ownerSetupHref("verify"), "/dashboard/onboarding");
  assert.equal(ownerSetupHref("capture"), "/dashboard/onboarding");
  assert.equal(ownerSetupHref("owner_phone"), "/dashboard/settings");
  assert.equal(ownerSetupHref("done"), "/dashboard");
});

test("onboarding state survives refresh and existing-shop conflicts", () => {
  const api = read("src/app/api/onboarding/route.ts");
  const guard = read("src/components/onboarding-guard.tsx");
  const wizard = read("src/components/onboarding-wizard.tsx");
  const forwardGuide = read("src/app/api/account/forward-guide/route.ts");

  assert.match(api, /getOwnerSetupStatus\(business\)/);
  assert.match(api, /provisioned: Boolean\(business\)/);
  assert.match(guard, /!json\.provisioned && !onOnboarding/);
  assert.match(guard, /json\.ready && onOnboarding/);
  assert.match(wizard, /res\.status === 409 && \(await resumeExisting\(\)\)/);
  assert.match(wizard, /OnboardingCallVerify/);
  assert.match(wizard, /setProvisionedLine/);
  assert.match(forwardGuide, /call your Orvius line once; then reply DONE/i);
});
