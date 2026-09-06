#!/usr/bin/env node
/**
 * Master-class craft gate — honesty + owner ritual, not just audit green.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const checks = [];

function pass(name, detail) {
  checks.push({ name, ok: true, detail });
  console.log(`✅ ${name}: ${detail}`);
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail });
  console.log(`❌ ${name}: ${detail}`);
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

console.log("\n🎓 Orvius master-class check\n");

if (existsSync(join(root, "docs/MASTER-CLASS.md"))) {
  pass("Master-class doc", "docs/MASTER-CLASS.md present");
} else {
  fail("Master-class doc", "docs/MASTER-CLASS.md missing");
}

const theaterFiles = [
  "src/components/capture-setup-panel.tsx",
  "src/components/onboarding-capture-step.tsx",
  "src/components/onboarding-call-verify.tsx",
];
const theaterPattern = /or I will before go-live|or will be my published/i;
let theaterHit = null;
for (const rel of theaterFiles) {
  try {
    if (theaterPattern.test(read(rel))) theaterHit = rel;
  } catch {
    fail(`Theater scan ${rel}`, "File missing");
  }
}
if (!theaterHit) {
  pass("Capture honesty", "No future-tense confirm theater in capture UI");
} else {
  fail("Capture honesty", `Theater copy in ${theaterHit}`);
}

try {
  const account = read("src/app/api/account/route.ts");
  if (
    /overflowForwardConfirmedAt === true/.test(account) &&
    /!existing\.lineVerifiedAt/.test(account) &&
    /Prove your Orvius line with one test call before confirming capture/i.test(
      account,
    )
  ) {
    pass(
      "API prove-before-confirm",
      "PATCH rejects overflow confirm without lineVerifiedAt",
    );
  } else {
    fail(
      "API prove-before-confirm",
      "account PATCH must require lineVerifiedAt before overflow confirm",
    );
  }
} catch {
  fail("API prove-before-confirm", "src/app/api/account/route.ts missing");
}

try {
  const settings = read("src/app/dashboard/settings/page.tsx");
  if (/Multi-b launch gates|LaunchGatesStrip|GoLiveChecklist/.test(settings)) {
    fail(
      "Settings ritual",
      "Settings still stacks Multi-b / go-live cockpit — collapse to ProSetupHub",
    );
  } else if (/ProSetupHub/.test(settings)) {
    pass("Settings ritual", "Single setup hub — no Multi-b cockpit stack");
  } else {
    fail("Settings ritual", "ProSetupHub missing from Settings");
  }
} catch {
  fail("Settings ritual", "settings page missing");
}

try {
  const queue = read("src/lib/attention-queue.ts");
  const ui = read("src/components/attention-queue.tsx");
  const hasCapture =
    /needs_capture/.test(queue) &&
    /Prove your line/.test(queue) &&
    /Confirm call capture/.test(queue) &&
    /impact:\s*"critical"/.test(queue);
  if (hasCapture) {
    pass("Attention capture", "Prove-first capture items at critical impact");
  } else {
    fail(
      "Attention capture",
      "needs_capture must be critical with prove + confirm copy",
    );
  }
  if (/canTestAlert|TestAlertButton/.test(ui) && /alert_failed/.test(ui)) {
    pass("Attention alert action", "Failed alerts expose Send test alert");
  } else {
    fail(
      "Attention alert action",
      "Attention UI needs TestAlertButton for alert_failed",
    );
  }
  if (/multi-b requires/i.test(queue)) {
    fail(
      "Attention owner language",
      "Weekly proof copy still uses multi-b jargon",
    );
  } else {
    pass("Attention owner language", "No multi-b jargon in attention queue");
  }
} catch (e) {
  fail("Attention craft", e instanceof Error ? e.message : String(e));
}

try {
  const sms = read("src/app/api/webhooks/twilio/sms/route.ts");
  if (
    /lineVerifiedAt/.test(sms) &&
    (/isOwnerCaptureDoneKeyword/.test(sms) || /DONE/.test(sms))
  ) {
    pass("SMS DONE honesty", "DONE keyword requires lineVerifiedAt");
  } else {
    fail("SMS DONE honesty", "Twilio SMS DONE must gate on lineVerifiedAt");
  }
} catch {
  fail("SMS DONE honesty", "twilio sms webhook missing");
}

const failed = checks.filter((c) => !c.ok).length;
console.log("\n─────────────────────────────────────");
console.log(
  failed === 0
    ? `\n✅ MASTER CLASS: ${checks.length}/${checks.length} craft gates clear\n`
    : `\n❌ MASTER CLASS: ${failed} gate(s) open — fix before claiming craft\n`,
);
process.exit(failed === 0 ? 0 : 1);
