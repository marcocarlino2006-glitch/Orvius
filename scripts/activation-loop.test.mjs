import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.STRIPE_PRICE_ID_PRO = "price_activation_pro";

const { resolvePaidCheckoutActivation } =
  await import("../src/lib/billing-sync.ts");

function subscription(status = "active") {
  return {
    id: "sub_activation",
    status,
    customer: "cus_activation",
    metadata: {},
    items: {
      data: [{ price: { id: "price_activation_pro" } }],
    },
  };
}

function checkout(email = "owner@example.com") {
  return {
    id: "cs_activation",
    mode: "subscription",
    customer_email: email,
    customer_details: null,
  };
}

test("paid checkout is bound to the owner before line provisioning", () => {
  assert.deepEqual(
    resolvePaidCheckoutActivation(
      checkout(),
      subscription(),
      "owner@example.com",
    ),
    {
      customerId: "cus_activation",
      subscriptionId: "sub_activation",
      planId: "pro",
    },
  );

  assert.throws(
    () =>
      resolvePaidCheckoutActivation(
        checkout("other@example.com"),
        subscription(),
        "owner@example.com",
      ),
    /does not belong/,
  );
  assert.throws(
    () =>
      resolvePaidCheckoutActivation(
        checkout(),
        subscription("incomplete"),
        "owner@example.com",
      ),
    /Complete payment/,
  );
});

test("self-serve activation has no implicit pilot", () => {
  const onboarding = readFileSync(
    new URL("../src/app/api/onboarding/route.ts", import.meta.url),
    "utf8",
  );
  const provision = readFileSync(
    new URL("../src/lib/provision-business.ts", import.meta.url),
    "utf8",
  );
  const wizard = readFileSync(
    new URL("../src/components/onboarding-wizard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(onboarding, /getPaidCheckoutActivation/);
  assert.match(onboarding, /paid_checkout_required/);
  assert.match(provision, /billingStatus: "active"/);
  assert.match(provision, /pilotEndsAt: null/);
  assert.doesNotMatch(provision, /setDate\(d\.getDate\(\) \+ 30\)/);
  assert.match(wizard, /Paid subscription · verified/);
  assert.doesNotMatch(wizard, /Design partner/);
});

test("owners can repair incomplete qualification and retry automation", () => {
  const route = readFileSync(
    new URL("../src/app/api/leads/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const form = readFileSync(
    new URL("../src/components/lead-qualification-form.tsx", import.meta.url),
    "utf8",
  );
  const detail = readFileSync(
    new URL("../src/app/dashboard/inbox/[id]/page.tsx", import.meta.url),
    "utf8",
  );

  for (const field of ["phone", "serviceType", "urgency", "address", "notes"]) {
    assert.match(route, new RegExp(`${field}:`));
  }
  assert.match(route, /await maybeAutoBookLead\(id\)/);
  assert.equal(
    (route.match(/maybeAutoBookLead\(/g) ?? []).length,
    1,
    "opening a lead must not book it as a read side effect",
  );
  assert.match(route, /ensureBookingDepositForJob/);
  assert.match(route, /depositRecovery/);
  assert.match(route, /!existing\.customerId \|\| phoneChanged/);
  assert.match(form, /Save and continue automation/);
  assert.match(form, /Lead completed and booked automatically/);
  assert.match(form, /Lead updated and deposit delivery retried/);
  assert.doesNotMatch(form, /location\.reload/);
  assert.match(detail, /Correct call details/);
  assert.match(detail, /retries an unsent\s+booking deposit/);
});

test("manual quick-book cannot bypass qualification or fail silently", () => {
  const jobs = readFileSync(
    new URL("../src/app/api/jobs/route.ts", import.meta.url),
    "utf8",
  );
  const quickBook = readFileSync(
    new URL("../src/components/today-priority-leads.tsx", import.meta.url),
    "utf8",
  );

  assert.match(jobs, /isLeadQualifiedForBooking\(lead\)/);
  assert.match(jobs, /lead_needs_details/);
  assert.match(jobs, /status: 422/);
  assert.match(quickBook, /setError\(/);
  assert.match(quickBook, /role="alert"/);
  assert.doesNotMatch(quickBook, /detail page fallback/);
});

test("a rejected deposit delivery has an executable recovery action", () => {
  const moneyPanel = readFileSync(
    new URL("../src/components/job-money-panel.tsx", import.meta.url),
    "utf8",
  );
  const deposits = readFileSync(
    new URL("../src/app/api/deposits/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(moneyPanel, /!deposit\.sentAt && customerPhone/);
  assert.match(moneyPanel, /Retry deposit text/);
  assert.match(moneyPanel, /requestDeposit\(\)/);
  assert.match(moneyPanel, /Copy deposit link/);
  assert.match(deposits, /createDepositForLead/);
  assert.match(deposits, /sendDepositLink/);
  /*
    Retrying an existing request must not re-derive the amount from current
    settings: a shop that changed or switched off its default would otherwise
    be unable to resend a link the customer was already quoted.
  */
  assert.match(deposits, /active\?\.amountCents/);
  /* A retry that reused an existing request must not claim it created one. */
  assert.match(
    moneyPanel,
    /data\.created \? "Link created" : "Same link kept"/,
  );
  assert.doesNotMatch(moneyPanel, /copy it below/);
});
