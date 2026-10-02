import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  advancePendingTexting,
  advanceTextingRegistration,
  shopTextSender,
  submitTextingRegistration,
  validateTextingDetails,
} from "../src/lib/shop-texting.ts";

const prisma = new PrismaClient();
process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID = "BUprimary";

const good = {
  legalName: "Ray's Heating & Air LLC",
  businessType: "Limited Liability Corporation",
  ein: "123456789",
  website: "raysheating.com",
  street: "1 Main St",
  city: "Austin",
  region: "tx",
  postalCode: "78701",
  repFirstName: "Ray",
  repLastName: "Diaz",
  repEmail: "Ray@RaysHeating.com",
  repPhone: "(512) 555-0100",
  repTitle: "",
};

/* Stands in for Twilio: every create returns a fresh sid; review states are set by the test. */
function fakeTwilio() {
  const calls = [];
  const review = { profile: "pending-review", product: "pending-review", brand: "PENDING", campaign: "IN_PROGRESS" };
  let n = 0;
  const create = (kind) => async (p) => {
    calls.push({ kind, p });
    n += 1;
    return { sid: `${kind}${n}` };
  };
  const bundle = (key, assign, evaluate) => () => ({
    [assign]: { create: create(`${key}.assign`) },
    [evaluate]: { create: async () => ({ status: "compliant" }) },
    update: create(`${key}.update`),
    fetch: async () => ({ status: review[key] }),
  });
  const profiles = Object.assign(bundle("profile", "customerProfilesEntityAssignments", "customerProfilesEvaluations"), {
    create: create("BUprofile"),
  });
  const products = Object.assign(bundle("product", "trustProductsEntityAssignments", "trustProductsEvaluations"), {
    create: create("BUproduct"),
  });
  const services = Object.assign(
    () => ({
      phoneNumbers: { create: create("svc.number") },
      usAppToPerson: Object.assign(() => ({ fetch: async () => ({ campaignStatus: review.campaign }) }), {
        create: create("QEcampaign"),
      }),
    }),
    { create: create("MGservice") },
  );
  const client = {
    trusthub: {
      v1: {
        customerProfiles: profiles,
        trustProducts: products,
        endUsers: { create: create("ITenduser") },
        supportingDocuments: { create: create("RDdoc") },
      },
    },
    addresses: { create: create("ADaddress") },
    incomingPhoneNumbers: { list: async () => [{ sid: "PNshop" }] },
    messaging: {
      v1: {
        brandRegistrations: Object.assign(() => ({ fetch: async () => ({ status: review.brand }) }), {
          create: create("BNbrand"),
        }),
        services,
      },
    },
  };
  return { client, calls, review };
}

test("details the carriers would reject are caught before anything is sent", () => {
  const bad = validateTextingDetails({ ...good, ein: "12-34", region: "Texas", repPhone: "555", website: "nope" });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["ein", "region", "repPhone", "website"]);

  const ok = validateTextingDetails(good);
  assert.equal(ok.ok, true);
  assert.equal(ok.details.ein, "12-3456789");
  assert.equal(ok.details.region, "TX");
  assert.equal(ok.details.website, "https://raysheating.com");
  assert.equal(ok.details.repPhone, "+15125550100");
  assert.equal(ok.details.repEmail, "ray@raysheating.com");
  assert.equal(ok.details.repTitle, "Owner");
});

test("a shop walks profile, brand and campaign review, then texts from its own number", async () => {
  const business = await prisma.business.create({
    data: {
      name: "Texting Proof",
      slug: `texting-${Date.now()}`,
      billingStatus: "pilot",
      twilioPhone: "+15125550199",
    },
  });
  try {
    const { details } = validateTextingDetails(good);
    let row = await submitTextingRegistration(business.id, details);
    const { client, calls, review } = fakeTwilio();
    assert.equal(await shopTextSender(business.id), null);

    row = await advanceTextingRegistration(row, client);
    assert.equal(row.status, "profile_review");
    assert.ok(row.customerProfileSid && row.trustProductSid);
    assert.equal(row.brandSid, null, "no brand until Twilio approves the profile");
    assert.ok(
      calls.some((c) => c.kind === "profile.assign" && c.p.objectSid === "BUprimary"),
      "the shop's profile hangs off Orvius's primary profile",
    );

    row = await advanceTextingRegistration(row, client);
    assert.equal(row.status, "profile_review", "waiting is a no-op, not a duplicate");
    assert.equal(calls.filter((c) => c.kind === "BUprofile").length, 1);

    await assert.rejects(submitTextingRegistration(business.id, details), /already with the carriers/);

    review.profile = review.product = "twilio-approved";
    row = await advanceTextingRegistration(row, client);
    assert.equal(row.status, "brand_review");

    review.brand = "APPROVED";
    row = await advanceTextingRegistration(row, client);
    assert.equal(row.status, "campaign_review");
    assert.ok(row.messagingServiceSid && row.campaignSid);
    const campaign = calls.find((c) => c.kind === "QEcampaign").p;
    assert.match(campaign.description, /Texting Proof/);
    assert.ok(calls.some((c) => c.kind === "svc.number" && c.p.phoneNumberSid === "PNshop"));
    assert.equal(await shopTextSender(business.id), null, "still the shared sender until the campaign is verified");

    review.campaign = "VERIFIED";
    row = await advanceTextingRegistration(row, client);
    assert.equal(row.status, "approved");
    assert.deepEqual(await shopTextSender(business.id), { messagingServiceSid: row.messagingServiceSid });
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a refused brand is shown to the owner and can be sent again", async () => {
  const business = await prisma.business.create({
    data: { name: "Texting Refused", slug: `texting-no-${Date.now()}`, billingStatus: "pilot", twilioPhone: "+15125550198" },
  });
  try {
    const { details } = validateTextingDetails(good);
    let row = await submitTextingRegistration(business.id, details);
    const { client, review } = fakeTwilio();
    review.profile = review.product = "twilio-approved";
    review.brand = "FAILED";
    row = await advanceTextingRegistration(row, client);
    row = await advanceTextingRegistration(row, client);
    assert.equal(row.status, "failed");
    assert.ok(row.failureReason);

    row = await submitTextingRegistration(business.id, details);
    assert.equal(row.status, "submitted");
    assert.equal(row.customerProfileSid, null, "a resubmission starts over");
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("the cron does nothing when Orvius hasn't set up registration", async () => {
  const saved = process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID;
  delete process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID;
  try {
    assert.deepEqual(await advancePendingTexting(), { checked: 0, skipped: "not configured" });
  } finally {
    process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID = saved;
  }
});

test("a shop without its own number fails with a reason instead of retrying forever", async () => {
  const business = await prisma.business.create({
    data: { name: "Texting No Number", slug: `texting-nonum-${Date.now()}`, billingStatus: "pilot" },
  });
  try {
    const { details } = validateTextingDetails(good);
    const row = await submitTextingRegistration(business.id, details);
    const next = await advanceTextingRegistration(row, fakeTwilio().client);
    assert.equal(next.status, "failed");
    assert.match(next.failureReason, /no number/);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});
