import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.STRIPE_PRICE_ID_PRO = "price_activation_pro";

const { resolvePaidCheckoutActivation } = await import(
  "../src/lib/billing-sync.ts"
);

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
