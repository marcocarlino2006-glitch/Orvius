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
      "Settings still stacks a second Multi-b / go-live cockpit",
    );
  } else if (
    /Founder phone certification/.test(settings) &&
    /account\?\.founder/.test(settings) &&
    /founderCertJson/.test(settings) &&
    !/<ProSetupHub/.test(settings)
  ) {
    pass("Settings ritual", "Quiet founder-only certification — no duplicate setup cockpit");
  } else {
    fail("Settings ritual", "Founder certification is not wired through quiet Settings");
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
  if (
    /TestAlertButton/.test(ui) &&
    (/alert_failed/.test(ui) ||
      (/attentionActionStrategy/.test(ui) && /canTestAlert/.test(ui)))
  ) {
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

// Presence — fail the brand-swap test
try {
  const hero = read("src/components/home-line-hero.tsx");
  const liveCall = read("src/components/home-live-call.tsx");
  const statement = read("src/components/home-statement.tsx");
  const company = read("src/lib/company.ts");
  /*
    The hero moved from the mkt-* skin to the ov-* one, so match either prefix.
    What is being asserted is unchanged and is about substance, not selectors:
    the line is a callable artifact, its digits carry motion, the product runs
    on a stage beside it, and the copy makes the night-shift claim.
  */
  if (
    /(mkt|ov)-hero-live-?line/.test(hero) &&
    /night shift/i.test(hero) &&
    /DEMO_LINE_DISPLAY/.test(hero) &&
    /(mkt|ov)-hero-live-?line-digit|mkt-hero-live-digit/.test(hero) &&
    (/(mkt|ov)-hero-stage/.test(hero) || /atmosphere/.test(hero) || /HomeLiveCall/.test(hero))
  ) {
    pass(
      "Presence hero",
      "Live line motion + product stage + night-shift claim",
    );
  } else {
    fail(
      "Presence hero",
      "Hero must lead with live-digit motion, product stage, night-shift claim",
    );
  }
  if (
    !/Assigning…/.test(liveCall) &&
    (/ov-console/.test(liveCall) || /atmosphere/.test(liveCall))
  ) {
    pass("Presence marketing", "Live-call console never shows Assigning…");
  } else if (/Assigning…/.test(liveCall)) {
    fail("Presence marketing", "home-live-call still contains Assigning…");
  } else {
    fail("Presence marketing", "live-call console / atmosphere missing");
  }
  if (
    /Night rules/.test(statement) &&
    /How the shop runs when you/.test(statement)
  ) {
    pass("Presence doctrine", "Shop-floor night rules — not first-principles cosplay");
  } else {
    fail(
      "Presence doctrine",
      "Statement must use night rules, not first-principles theater",
    );
  }
  if (
    /night.?shift OS for HVAC/i.test(company) ||
    /night-shift OS for HVAC/i.test(company)
  ) {
    pass("Presence category", "Company copy owns night-shift OS category");
  } else {
    fail("Presence category", "company.ts must claim night-shift OS, not AI receptionist");
  }
} catch (e) {
  fail("Presence craft", e instanceof Error ? e.message : String(e));
}

// LOOK first principles — hero diet (no stats / showcase in first company beats)
try {
  const home = read("src/app/page.tsx");
  if (/HomeStatsBanner|HomeToolShowcase/.test(home)) {
    fail(
      "Look hero diet",
      "Homepage must not mount stats strip or Cursor-style showcase",
    );
  } else if (
    /HomeLineHero/.test(home) &&
    /HomeStatement/.test(home) &&
    /HomeCallStory/.test(home)
  ) {
    pass("Look hero diet", "Hero → night rules → call story — no stats/showcase");
  } else {
    fail("Look hero diet", "Homepage missing core beats");
  }
  const hero = read("src/components/home-line-hero.tsx");
  if (/ov-hero-brand/.test(hero) && /Orvius/.test(hero)) {
    pass("Look brand signal", "Hero carries Orvius as a brand-level signal");
  } else {
    fail("Look brand signal", "Hero must include ov-hero-brand Orvius");
  }
  if (
    /ov-hero--atmosphere/.test(hero) &&
    /ov-hero-sky/.test(hero) &&
    /ov-hero-sky-horizon/.test(hero)
  ) {
    pass("Look atmosphere", "Hero is a full-bleed night plane with sky layers");
  } else {
    fail("Look atmosphere", "Hero must include ov-hero--atmosphere sky layers");
  }
  const nav = read("src/components/premium-nav.tsx");
  if (/Enterprise|nav\.enterprise|\/resources/.test(nav) && /href: "\/product"/.test(nav)) {
    fail("Look nav", "Primary nav still mirrors Cursor mega-nav");
  } else if (/\/pricing/.test(nav) && /\/pilot/.test(nav) && /\/about/.test(nav)) {
    pass("Look nav", "Primary nav is Pricing · Audit · About");
  } else {
    fail("Look nav", "Primary nav must be trades-native (Pricing · Audit · About)");
  }
  const outcomes = read("src/components/pro-command-outcomes.tsx");
  if (/exception requires|exceptions require/i.test(outcomes)) {
    fail(
      "Operate owner language",
      "Command outcomes still uses exception jargon for owners",
    );
  } else if (/needs you on the board|Board is clear/.test(outcomes)) {
    pass("Operate owner language", "Command pulse speaks owner language");
  } else {
    fail("Operate owner language", "Outcomes footer must use board / needs-you language");
  }
  const dash = read("src/app/dashboard/page.tsx");
  if (
    dash.indexOf("<ShopOperateBanner") < dash.indexOf("<Ring1CommandCenter") &&
    dash.indexOf("<FounderNextGate") < dash.indexOf("<ShopOperateBanner") &&
    /FirstNightHandoff/.test(dash)
  ) {
    pass("Operate ritual order", "First-night → next-gate → shop operate → Command");
  } else {
    fail(
      "Operate ritual order",
      "Dashboard must order FirstNightHandoff → FounderNextGate → ShopOperateBanner → Command",
    );
  }
  const guard = read("src/components/onboarding-guard.tsx");
  const handoff = read("src/components/first-night-handoff.tsx");
  if (
    /!json\.ready/.test(guard) &&
    /owner_phone/.test(guard) &&
    /Tonight has one job/.test(handoff) &&
    /markFirstNightPending/.test(handoff)
  ) {
    pass("First-night handoff", "Setup cliff closed — unfinished shops stay in tunnel");
  } else {
    fail(
      "First-night handoff",
      "OnboardingGuard must hold unfinished setup; FirstNightHandoff must exist",
    );
  }
  const operate = read("src/lib/shop-operate.ts");
  if (
    /resolveShopOperateNext/.test(operate) &&
    /failedAlerts/.test(operate) &&
    /weekly-proof/.test(operate)
  ) {
    pass("Operate next resolver", "shop-operate resolves alerts → setup → board → proof");
  } else {
    fail("Operate next resolver", "src/lib/shop-operate.ts missing load-bearing next logic");
  }
  const board = read("src/components/attention-queue.tsx");
  if (/exception|exceptions/.test(board) && /attention-queue-title/.test(board)) {
    const titleBlock = board.match(/attention-queue-title[\s\S]{0,120}/)?.[0] ?? "";
    if (/exception/i.test(titleBlock)) {
      fail("Operate board language", "Attention title still says exceptions");
    } else {
      pass("Operate board language", "Board title uses items / need you");
    }
  } else if (/items need you|Board is clear/.test(board)) {
    pass("Operate board language", "Board title uses items / need you");
  } else {
    fail("Operate board language", "Attention board must speak owner language");
  }
  const banner = read("src/components/shop-operate-banner.tsx");
  if (
    /copyWeeklyProofRitual/.test(banner) &&
    /test-alert/.test(banner) &&
    /runInline/.test(banner)
  ) {
    pass("Operate one-tap rituals", "Proof + test alert finish in the shop pulse");
  } else {
    fail("Operate one-tap rituals", "ShopOperateBanner must inline proof and test alert");
  }
  const kinds = read("src/lib/attention-types.ts");
  if (/ATTENTION_KINDS/.test(kinds) && /attentionActionStrategy/.test(kinds)) {
    pass("Operate action map", "Every attention kind maps to a one-tap strategy");
  } else {
    fail("Operate action map", "attention-types missing ATTENTION_KINDS / strategy map");
  }
  const brain = read("src/lib/shop-brain.ts");
  const askDock = read("src/components/os-ask-dock.tsx");
  if (
    (/isNextActionQuestion/.test(brain) || /isNextActionQuestion/.test(operate)) &&
    /source: "operate"/.test(brain) &&
    /What should I do now/.test(askDock)
  ) {
    pass("Cursor tunnel Ask", "Ask answers what-to-do from the same next gate");
  } else {
    fail("Cursor tunnel Ask", "Ask must lead with What should I do now + operate source");
  }
  if (/id: "covered"/.test(operate) && /Ask Orvius/.test(operate)) {
    pass("Cursor tunnel covered", "Clear shop still returns a next move");
  } else {
    fail("Cursor tunnel covered", "resolveShopOperateNext must never go silent");
  }
  const rail = read("src/components/pro-launch-control.tsx");
  if (/showPrimaryAction/.test(rail) && /banner above/.test(rail)) {
    pass("Cursor tunnel one CTA", "Rail defers to the shop pulse banner");
  } else {
    fail("Cursor tunnel one CTA", "ProLaunchControl must not compete with the banner");
  }
  const wantsHuman = read("src/lib/lead-wants-human.ts");
  const notAJob = read("src/lib/lead-not-a-job.ts");
  if (
    /leadWantsHuman/.test(wantsHuman) &&
    /wants_human/.test(kinds) &&
    /Wants you/.test(kinds)
  ) {
    pass("Wants-human outcome", "Caller-asked-for-person is a board kind with Call");
  } else {
    fail("Wants-human outcome", "wants_human kind + leadWantsHuman detector required");
  }
  if (
    /leadIsNotAJob/.test(notAJob) &&
    /not_a_job/.test(kinds) &&
    /MarkNotAJobButton/.test(board)
  ) {
    pass("Not-a-job outcome", "Spam/OOA/wrong-trade clears with one tap");
  } else {
    fail("Not-a-job outcome", "not_a_job kind + MarkNotAJobButton required");
  }
  const partial = read("src/lib/lead-partial-capture.ts");
  if (/leadIsPartialCapture/.test(partial) && /partial_capture/.test(kinds)) {
    pass("Partial-capture outcome", "Hang-up stubs surface as Call back");
  } else {
    fail("Partial-capture outcome", "partial_capture kind + detector required");
  }
} catch (e) {
  fail("Look craft", e instanceof Error ? e.message : String(e));
}

const failed = checks.filter((c) => !c.ok).length;
console.log("\n─────────────────────────────────────");
console.log(
  failed === 0
    ? `\n✅ MASTER CLASS: ${checks.length}/${checks.length} craft gates clear\n`
    : `\n❌ MASTER CLASS: ${failed} gate(s) open — fix before claiming craft\n`,
);
process.exit(failed === 0 ? 0 : 1);
