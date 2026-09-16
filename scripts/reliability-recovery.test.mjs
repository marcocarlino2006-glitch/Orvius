import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { alertFailureRecoveryHint } from "../src/lib/owner-alerts.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("every existing shop-line repair backfills the voice fallback", () => {
  const provisioning = read("src/lib/provision-business.ts");
  const twilio = read("src/lib/twilio-phone.ts");

  assert.match(
    provisioning,
    /if \(!needsLine && currentLine\) \{[\s\S]*configureSmsWebhook\(currentLine\)[\s\S]*attachAssistantToShopLine/,
  );
  assert.match(
    provisioning,
    /repairAllCustomerShopLines[\s\S]*ensureDedicatedShopLine\(business\)/,
  );
  assert.match(
    twilio,
    /voiceFallbackUrl: getWebhookUrl\("\/api\/webhooks\/twilio\/voice-fallback"\)/,
  );
  assert.match(twilio, /\.\.\.voiceFallback\(\)/);
});

test("owner dashboard health checks trigger stuck-alert recovery", () => {
  for (const path of [
    "src/app/api/ring1/route.ts",
    "src/app/api/shop/health/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /stuckPendingAlerts > 0/);
    assert.match(source, /drainOwnerAlerts\(/);
  }
});

test("provider failures become specific owner recovery steps", () => {
  assert.match(
    alertFailureRecoveryHint("Twilio error 21610", "sms"),
    /Text START/,
  );
  assert.match(
    alertFailureRecoveryHint("Twilio error 30006", "sms"),
    /mobile number/,
  );
  assert.match(
    alertFailureRecoveryHint("Resend rejected email", "email"),
    /Verify the owner email/,
  );
  assert.match(
    alertFailureRecoveryHint("Twilio credentials not configured", "sms"),
    /service configuration/,
  );
});
