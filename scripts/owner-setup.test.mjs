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

test("line proof unlocks Command — capture is next, not a fake door", () => {
  assert.equal(getOwnerSetupStatus(base).nextStep, "verify");
  const verified = getOwnerSetupStatus({
    ...base,
    lineVerifiedAt: new Date(),
  });
  assert.equal(verified.nextStep, "capture");
  assert.equal(verified.ready, true);
  assert.equal(verified.captureConfirmed, false);
  assert.equal(
    getOwnerSetupStatus({
      ...base,
      lineVerifiedAt: new Date(),
      overflowForwardConfirmedAt: new Date(),
    }).nextStep,
    "done",
  );
});

test("recovery links resume the guided setup ritual", () => {
  assert.equal(ownerSetupHref("line"), "/dashboard/onboarding");
  assert.equal(ownerSetupHref("verify"), "/dashboard/onboarding");
  assert.equal(ownerSetupHref("capture"), "/dashboard/settings#overflow-forward");
  assert.equal(ownerSetupHref("owner_phone"), "/dashboard/settings");
  assert.equal(ownerSetupHref("done"), "/dashboard");
});

test("onboarding state survives refresh and existing-shop conflicts", () => {
  const api = read("src/app/api/onboarding/route.ts");
  const guard = read("src/components/onboarding-guard.tsx");
  const wizard = read("src/components/onboarding-wizard.tsx");
  const forwardGuide = read("src/app/api/account/forward-guide/route.ts");
  const verify = read("src/components/onboarding-call-verify.tsx");

  assert.match(api, /getOwnerSetupStatus\(business\)/);
  assert.match(api, /provisioned: Boolean\(business\)/);
  assert.match(guard, /!json\.provisioned && !onOnboarding/);
  assert.match(guard, /json\.ready && onOnboarding/);
  assert.match(wizard, /res\.status === 409 && \(await resumeExisting\(\)\)/);
  assert.match(wizard, /OnboardingCallVerify/);
  assert.match(wizard, /setProvisionedLine/);
  assert.match(forwardGuide, /call your Orvius line once; then reply DONE/i);
  assert.doesNotMatch(verify, /overflowForwardConfirmedAt:\s*true/);
});
