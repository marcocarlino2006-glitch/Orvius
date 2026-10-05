/*
 * When the tech heads out, the customer gets one "on the way" text with the
 * tech's first name, the ETA and a link to a live status page, the way
 * ServiceTitan, Jobber and Housecall Pro customers do.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}
const { onTheWayText } = await import("../src/lib/on-the-way.ts");
const { updateJobStatus } = await import("../src/lib/job.ts");
const { confirmJobByCustomerToken, confirmLinkExpired } = await import("../src/lib/customer-confirm.ts");

const prisma = new PrismaClient();
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const PHONE = "+15125550188";

/* A demo shop with no real line simulates its texts, so the send path runs end to end without Twilio. */
async function withJob(extra, run) {
  const shop = await prisma.business.create({
    data: { name: "Way Air", slug: `way-${stamp()}`, environment: "demo", timezone: "America/Chicago" },
  });
  try {
    const customer = await prisma.customer.create({
      data: { businessId: shop.id, phone: PHONE, phoneNormalized: PHONE, name: "Pat Lee" },
    });
    const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Ray Ortiz" } });
    const job = await prisma.job.create({
      data: {
        businessId: shop.id,
        customerId: customer.id,
        technicianId: tech.id,
        title: "AC not cooling",
        status: "confirmed",
        scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        ...extra,
      },
    });
    await run({ shop, job });
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
}

const sentTexts = (businessId) =>
  prisma.message.findMany({ where: { businessId, direction: "out", phoneNormalized: PHONE }, orderBy: { createdAt: "asc" } });

test("the text names the tech, gives the ETA and links the status page", () => {
  const body = onTheWayText({ shop: "Way Air", tech: "Ray", eta: "25 min", url: "https://orvius.im/c/abc" });
  assert.match(body, /^Way Air: Ray is on the way and should arrive in about 25 min\./);
  assert.match(body, /Follow along: https:\/\/orvius\.im\/c\/abc/);
  assert.match(body, /STOP/i, "carries the opt-out footer");
  assert.match(onTheWayText({ shop: "Way Air", tech: null, eta: null, url: "u" }), /^Way Air: Your technician is on the way\./);
});

test("heading out texts the customer once, however many times it is marked", async () => {
  await withJob({ etaText: "25 min" }, async ({ shop, job }) => {
    await updateJobStatus(job.id, "en_route");
    await updateJobStatus(job.id, "en_route");
    const texts = await sentTexts(shop.id);
    assert.equal(texts.length, 1, "one text for one trip");
    assert.match(texts[0].body, /Ray is on the way and should arrive in about 25 min/);
    assert.doesNotMatch(texts[0].body, /Ortiz/, "first name only");
    const fresh = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(fresh.status, "en_route");
    assert.ok(fresh.dispatchedAt);
    assert.ok(fresh.customerConfirmToken, "the link has a token");
    assert.ok(texts[0].body.includes(`/c/${fresh.customerConfirmToken}`));
    const audits = await prisma.auditEvent.count({ where: { businessId: shop.id, action: "customer.on_the_way_sent" } });
    assert.equal(audits, 1);
  });
});

test("other status changes send no on-the-way text", async () => {
  await withJob({}, async ({ shop, job }) => {
    await updateJobStatus(job.id, "confirmed");
    await updateJobStatus(job.id, "on_site");
    assert.equal((await sentTexts(shop.id)).length, 0);
  });
});

test("the status page stays open past the window while the tech is coming or there, and names them", async () => {
  const late = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  assert.equal(confirmLinkExpired({ status: "en_route", scheduledAt: late }, new Date()), false);
  assert.equal(confirmLinkExpired({ status: "on_site", scheduledAt: late }, new Date()), false);
  assert.equal(confirmLinkExpired({ status: "confirmed", scheduledAt: late }, new Date()), true);
  assert.equal(confirmLinkExpired({ status: "completed", scheduledAt: null }, new Date()), true);

  await withJob({ etaText: "15 min", scheduledAt: late, customerConfirmToken: `tok-${stamp()}` }, async ({ job }) => {
    await updateJobStatus(job.id, "en_route");
    const result = await confirmJobByCustomerToken(job.customerConfirmToken, new Date(), { readOnly: true });
    assert.equal(result.ok, true);
    assert.equal(result.job.status, "en_route");
    assert.equal(result.job.technicianName, "Ray");
    assert.equal(result.job.etaText, "15 min");
    assert.ok(result.job.dispatchedAt);
  });
});

test("the tech's Heading there carries the ETA into the text, and the page follows a live visit", () => {
  const tech = read("src/components/tech-field-client.tsx");
  assert.match(tech, /next!\.status === "en_route" && etaText\.trim\(\) \? \{ etaText: etaText\.trim\(\) \} : \{\}/);
  const page = read("src/app/c/[token]/page.tsx");
  assert.match(page, /const LIVE = new Set\(\["scheduled", "confirmed", "en_route"\]\)/);
  assert.match(page, /is on the way/);
  const route = read("src/app/api/public/tech/[token]/route.ts");
  assert.ok(route.indexOf("body.etaText !== undefined") < route.indexOf("updateJobStatus(job.id"), "the ETA is saved before the status texts");
});

test.after(() => prisma.$disconnect());
