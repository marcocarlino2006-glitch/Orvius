import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { activationChecklist } from "../src/lib/activation.ts";
import { formatCentsExact } from "../src/lib/money.ts";
import {
  EXAMPLE_BILL_CENTS,
  PAYMENTS_HREF,
  exampleBillText,
  paymentExample,
  paymentsActivation,
} from "../src/lib/payments-intro.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const base = {
  lineVerifiedAt: new Date("2026-10-08T12:00:00Z"),
  ownerPhone: "+15125550100",
  ownerEmail: "owner@example.com",
  ownerSmsOptOutAt: null,
  latestAlert: null,
  transferPhone: null,
  transferProvenAt: null,
  connection: { state: "proven", label: "Proven", detail: "Your calls reach Orvius." },
  level: "alert",
};

test("the worked bill adds up: Stripe standard, the Orvius fee, the rest to the shop", () => {
  const ex = paymentExample(40_000, 100);
  assert.deepEqual(ex, { billCents: 40_000, stripeCents: 1_190, orviusCents: 400, netCents: 38_410 });
  assert.equal(ex.stripeCents + ex.orviusCents + ex.netCents, ex.billCents);
  assert.equal(paymentExample(40_000, 250).orviusCents, 1_000, "follows the configured fee");
  assert.deepEqual(paymentExample(0, 100), { billCents: 0, stripeCents: 0, orviusCents: 0, netCents: 0 });
  assert.equal(EXAMPLE_BILL_CENTS, 40_000);
});

test("the example text is worded exactly like the bill customers get", () => {
  const sender = read("src/lib/invoice-pay.ts");
  assert.match(sender, /`\$\{params\.business\.name\}: thanks for choosing us\. Your balance is `/);
  assert.match(sender, /`\$\{formatCentsExact\(params\.invoice\.amountCents\)\}\. Pay securely here: ` \+/);
  assert.equal(formatCentsExact(40_000), "$400.00", "same amount format as the real text");
  assert.equal(
    exampleBillText("Summit Heating & Air", 40_000),
    "Summit Heating & Air: thanks for choosing us. Your balance is $400.00. Pay securely here: orvius.im/i/…",
  );
});

test("getting paid is live only once Stripe clears charges, with the next step otherwise", () => {
  assert.equal(paymentsActivation("ready").state, "live");
  assert.equal(paymentsActivation("ready").action, undefined);
  for (const [state, label] of [
    ["not_started", "Set up payments"],
    ["in_progress", "Finish setup"],
    ["verifying", "Check status"],
  ]) {
    const item = paymentsActivation(state);
    assert.equal(item.state, "todo", state);
    assert.deepEqual(item.action, { label, href: PAYMENTS_HREF }, state);
  }
  assert.match(paymentsActivation("not_started").detail, /not to Orvius/);
});

test("the go-live list asks for payments only where card payments are open", () => {
  const without = activationChecklist(base);
  assert.ok(!without.some((i) => i.id === "payments"), "no dead-end step when Stripe isn't configured");

  const items = activationChecklist({ ...base, payments: "not_started" });
  const pay = items.find((i) => i.id === "payments");
  assert.equal(pay.label, "Getting paid");
  assert.equal(pay.state, "todo");
  assert.deepEqual(pay.action, { kind: "link", label: "Set up payments", href: "/dashboard/billing#payouts" });
  assert.equal(activationChecklist({ ...base, payments: "ready" }).find((i) => i.id === "payments").state, "live");

  const route = read("src/app/api/onboarding/live-check/route.ts");
  assert.match(route, /payments: isConnectConfigured\(\) \? getConnectStatus\(b\)\.state : null/);
});

test("billing introduces payments before asking for them, in owner language", () => {
  const panel = read("src/components/connect-payouts-panel.tsx");
  assert.match(panel, /state === "not_started" \|\| state === "in_progress"/);
  assert.match(panel, /<GetPaidIntro /);
  for (const part of ["PAYMENT_STEPS", "exampleBillText", "paymentExample", "SETUP_NEEDS", "STRIPE_STANDARD_LABEL"]) {
    assert.match(panel, new RegExp(part), part);
  }
  assert.match(read("src/app/api/connect/route.ts"), /feeBps: getPlatformFeeBps\(\),\n\s+shopName: business\.name,/);
  for (const file of ["src/components/job-bill-section.tsx", "src/components/deposit-settings-panel.tsx", "src/lib/attention-queue.ts"]) {
    assert.doesNotMatch(read(file), /Connect payouts|Open payouts/, file);
  }
  const pricing = read("src/app/pricing/page.tsx");
  assert.match(pricing, /paymentExample\(EXAMPLE_BILL_CENTS, getPlatformFeeBps\(\)\)/, "pricing shows the same worked bill");
});

test("every touch control is 44px and CI fails on anything smaller", () => {
  const css = read("src/app/globals.css");
  const floor = css.slice(css.indexOf("Touch floor"));
  assert.match(floor, /:not\(#tap-floor\) \{\s*min-height: 44px !important;/);
  assert.match(floor, /:not\(#tap-floor\) \{\s*min-width: 44px !important;/);
  const audit = read("scripts/visual-audit.mjs");
  assert.match(audit, /kind: "small-tap-target", blocking: true, detail: `\$\{small\.length\} controls under 44px`/);
  assert.match(audit, /if \(touch\) \{\n\s+const small/);
});
