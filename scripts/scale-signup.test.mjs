/*
 * Signup without the owner doing Orvius's work: the shop's details come from
 * its site or listing, Command opens before the test call, capture confirms
 * itself from a forwarded call, and porting is a form.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "GOOGLE_PLACES_API_KEY"]) delete process.env[key];

const { hoursFromPlaces, isPublicAddress, lookupShop, looksLikeWebsite, shopFromHtml } = await import("../src/lib/shop-lookup.ts");
const { detectCallCapture } = await import("../src/lib/capture-detect.ts");
const { submitPortRequest, updatePortRequest, validatePortInput } = await import("../src/lib/port-request.ts");
const { shopDraftFromMetadata, shopDraftMetadata, shopDraftSchema } = await import("../src/lib/checkout-shop.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const SITE = `<!doctype html><html><head><title>Ray's Heating &amp; Air | Austin HVAC repair</title>
<meta name="description" content="Furnace and AC repair in Austin.">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Ray's"},
{"@type":"HVACBusiness","name":"Ray's Heating & Air","telephone":"(512) 555-0100",
"address":{"@type":"PostalAddress","streetAddress":"1 Main St","addressLocality":"Austin","addressRegion":"TX","postalCode":"78701"},
"openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday","Friday"],"opens":"07:00","closes":"19:00"},
{"@type":"OpeningHoursSpecification","dayOfWeek":"https://schema.org/Saturday","opens":"08:00","closes":"12:00"}]}]}</script>
</head><body><a href="tel:+15125550100">Call</a></body></html>`;

test("a shop's own site fills the name, address, hours and trade", () => {
  const shop = shopFromHtml(SITE, "https://raysheating.com/");
  assert.equal(shop.name, "Ray's Heating & Air");
  assert.equal(shop.address, "1 Main St, Austin, TX 78701");
  assert.equal(shop.trade, "HVAC");
  const hours = JSON.parse(shop.hoursJson);
  assert.deepEqual(hours.monday, { open: "07:00", close: "19:00" });
  assert.deepEqual(hours.saturday, { open: "08:00", close: "12:00" });
  assert.equal(hours.sunday.closed, true);

  const plain = shopFromHtml(
    `<title>Drain Pros Plumbing - Home</title><script type="application/ld+json">{"@type":"Plumber","name":"Drain Pros","openingHours":["Mo-Fr 08:00-17:00","Sa 09:00-13:00"]}</script>`,
    "https://drainpros.com",
  );
  assert.equal(plain.trade, "Plumbing");
  assert.deepEqual(JSON.parse(plain.hoursJson).friday, { open: "08:00", close: "17:00" });
  assert.equal(JSON.parse(plain.hoursJson).sunday.closed, true);

  const titleOnly = shopFromHtml("<title>Bright Smile Dental | Family dentist</title>", "https://x.com");
  assert.equal(titleOnly.name, "Bright Smile Dental");
  assert.equal(titleOnly.hoursJson, null, "no hours guessed when the site has none");
});

test("Google hours map onto the same shape", () => {
  const hours = JSON.parse(
    hoursFromPlaces([
      { open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 17, minute: 30 } },
      { open: { day: 6, hour: 9 }, close: { day: 6, hour: 13 } },
    ]),
  );
  assert.deepEqual(hours.monday, { open: "08:00", close: "17:30" });
  assert.deepEqual(hours.saturday, { open: "09:00", close: "13:00" });
  assert.equal(hours.tuesday.closed, true);
  assert.equal(hoursFromPlaces([]), null);
});

test("lookups never reach private addresses, even through a redirect", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress("93.184.216.34"), true);
  assert.equal(looksLikeWebsite("raysheating.com"), true);
  assert.equal(looksLikeWebsite("Ray's Heating, Austin"), false);

  let fetched = 0;
  const fakeFetch = async (url) => {
    fetched += 1;
    if (String(url).includes("93.184.216.34/start")) {
      return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
    }
    return new Response(SITE, { status: 200, headers: { "content-type": "text/html" } });
  };
  const blocked = await lookupShop("http://127.0.0.1/admin", fakeFetch);
  assert.deepEqual(blocked.found, []);
  assert.equal(fetched, 0, "a private address is refused before any request");

  const redirected = await lookupShop("http://93.184.216.34/start", fakeFetch);
  assert.deepEqual(redirected.found, []);
  assert.equal(fetched, 1, "the redirect target is checked before it is followed");

  const ok = await lookupShop("http://93.184.216.34/", fakeFetch);
  assert.equal(ok.found[0].name, "Ray's Heating & Air");

  const noKey = await lookupShop("Ray's Heating, Austin", fakeFetch);
  assert.deepEqual(noKey.found, []);
  assert.match(noKey.reason, /website/);
});

test("found address and hours ride the checkout like the rest of the form", () => {
  const draft = shopDraftSchema.parse({
    name: "Ray's Heating & Air",
    trade: "HVAC",
    ownerPhone: "+15125550141",
    address: "1 Main St, Austin, TX 78701",
    hoursJson: shopFromHtml(SITE, "https://raysheating.com").hoursJson,
  });
  const metadata = shopDraftMetadata(draft, new Date());
  assert.ok(Object.values(metadata).every((v) => v.length <= 500));
  const back = shopDraftFromMetadata(metadata);
  assert.equal(back.address, draft.address);
  assert.equal(back.hoursJson, draft.hoursJson);
  assert.equal(shopDraftSchema.safeParse({ ...draft, hoursJson: "not json" }).success, false);
});

test("Command opens before the test call; only a shop with no line is sent back to setup", () => {
  const guard = readFileSync(new URL("../src/components/onboarding-guard.tsx", import.meta.url), "utf8");
  assert.match(guard, /next === "line"/);
  assert.doesNotMatch(guard, /next !== "done"/);
  const verify = readFileSync(new URL("../src/components/onboarding-call-verify.tsx", import.meta.url), "utf8");
  assert.match(verify, /Open Command, call later/);
});

async function shopWith(data) {
  return prisma.business.create({
    data: {
      name: "Capture Proof",
      slug: `capture-${stamp()}`,
      ownerPhone: "+15125550140",
      twilioPhone: "+15125550199",
      lineVerifiedAt: new Date(),
      ...data,
    },
  });
}

const twilioSaying = (forwardedFrom) => ({ calls: () => ({ fetch: async () => ({ forwardedFrom }) }) });

test("a call forwarded from the shop's number confirms capture once, and says why", async () => {
  const shop = await shopWith({ captureMode: "forward" });
  try {
    const base = { business: shop, vapiCallId: `call-${stamp()}`, providerCallId: "CA123" };
    assert.equal(
      await detectCallCapture({ ...base, callerPhone: "+15125550140", client: twilioSaying("+15125550100") }),
      null,
      "the owner calling doesn't count",
    );
    assert.equal(
      await detectCallCapture({ ...base, vapiCallId: "owner_test_1", callerPhone: "+15125550177", client: twilioSaying("+15125550100") }),
      null,
    );
    assert.equal(
      await detectCallCapture({ ...base, callerPhone: "+15125550177", client: twilioSaying(null) }),
      null,
      "no forwarding number: left for the owner, not guessed",
    );

    const evidence = await detectCallCapture({ ...base, callerPhone: "+15125550177", client: twilioSaying("+15125550100") });
    assert.deepEqual(evidence, { kind: "forwarded", from: "+15125550100" });
    const after = await prisma.business.findUniqueOrThrow({ where: { id: shop.id } });
    assert.ok(after.overflowForwardConfirmedAt && after.overflowProvedAt);
    const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "capture.confirmed" } });
    assert.equal(audit.actor, "orvius");
    assert.match(audit.summary, /forwarded from \+15125550100/);

    assert.equal(
      await detectCallCapture({ ...base, business: after, callerPhone: "+15125550178", client: twilioSaying("+15125550100") }),
      null,
      "runs once",
    );
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("a published number is confirmed by two different customers, not one", async () => {
  const shop = await shopWith({ captureMode: "publish" });
  try {
    const call = (phone) =>
      prisma.call.create({ data: { businessId: shop.id, vapiCallId: `v-${stamp()}`, callerPhone: phone } });
    await call("+15125550140");
    await call("+15125550171");
    assert.equal(await detectCallCapture({ business: shop, vapiCallId: "v1", callerPhone: "+15125550171" }), null);
    await call("+15125550172");
    const evidence = await detectCallCapture({ business: shop, vapiCallId: "v2", callerPhone: "+15125550172" });
    assert.deepEqual(evidence, { kind: "customers", callers: 2 });
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("porting is a form: checked, saved once, and resendable after a refusal", async () => {
  const bad = validatePortInput({ number: "123", carrier: "", accountName: "R", accountNumber: "1", serviceAddress: "x", authorizedName: "" });
  assert.equal(bad.ok, false);
  assert.deepEqual(
    Object.keys(bad.errors).sort(),
    ["accountName", "accountNumber", "authorizedName", "carrier", "number", "serviceAddress"],
  );

  const good = validatePortInput({
    number: "(512) 555-0100",
    carrier: "Verizon",
    accountName: "Ray's Heating & Air LLC",
    accountNumber: "4410-22",
    pin: "1234",
    serviceAddress: "1 Main St, Austin, TX 78701",
    authorizedName: "Ray Diaz",
  });
  assert.equal(good.ok, true);
  assert.equal(good.value.number, "+15125550100");

  const shop = await shopWith({});
  try {
    const row = await submitPortRequest(shop, good.value);
    assert.equal(row.status, "received");
    assert.equal(row.pinSealed, null, "no PIN stored without a sealing key");
    await assert.rejects(submitPortRequest(shop, good.value), /already in progress/);
    await prisma.portRequest.update({ where: { id: row.id }, data: { status: "failed" } });
    assert.equal((await submitPortRequest(shop, good.value)).status, "received");
    assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "port.requested" } }));

    const fresh = await prisma.portRequest.findUniqueOrThrow({ where: { businessId: shop.id } });
    const scheduled = await updatePortRequest({ id: fresh.id, status: "scheduled", portDate: new Date("2026-10-20T15:00:00Z") });
    assert.equal(scheduled.status, "scheduled");
    assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "port.scheduled" } }));
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});
