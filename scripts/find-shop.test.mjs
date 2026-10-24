import { test, after } from "node:test";
import assert from "node:assert/strict";

const { prisma } = await import("../src/lib/prisma.ts");
const { parseFindQuery, findShops, saveAreaRequest, claimAreaRequest, shopArea, areaCopy, AreaClaimError } = await import("../src/lib/find-shop.ts");
const { leaveVisitReview, reviewScore, reviewLine } = await import("../src/lib/visit-review.ts");

const created = [];
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

async function shop(data = {}) {
  const row = await prisma.business.create({
    data: {
      name: "Find HVAC",
      slug: `find-${uid()}`,
      environment: "production",
      trade: "HVAC",
      timezone: "America/Chicago",
      billingStatus: "active",
      address: "10 N State, Chicago, IL 60614",
      networkZip3: "606",
      vapiPhoneNumber: "+13125550100",
      twilioPhone: "+13125550100",
      ...data,
    },
  });
  created.push(row.id);
  return row;
}

test("a search is a launch trade and a ZIP", () => {
  assert.equal(parseFindQuery({ trade: "hvac", zip: "60614" })?.zip3, "606");
  assert.equal(parseFindQuery({ trade: "Roofing", zip: "60614" }), null);
  assert.equal(parseFindQuery({ trade: "HVAC", zip: "12" }), null);
  assert.equal(reviewLine(reviewScore([5, 4])), "4.5 from 2 finished visits");
  assert.equal(reviewLine(null), null);
});

test("only a live shop in that trade and ZIP is listed, with a finished visit's review", async () => {
  const live = await shop({ name: "North Side Heat", bookingPageOn: true });
  const quiet = await shop({ name: "No Number", vapiPhoneNumber: null, twilioPhone: null });
  const otherTrade = await shop({ name: "Pipe Co", trade: "Plumbing", slug: `find-plumb-${uid()}` });
  const otherZip = await shop({ name: "Far Heat", address: "1 Broadway, New York, NY 10001", networkZip3: "100", slug: `find-ny-${uid()}` });
  const testShop = await shop({ name: "Test Heat", environment: "test", slug: `find-test-${uid()}` });
  const canceled = await shop({ name: "Closed Heat", billingStatus: "canceled", slug: `find-off-${uid()}` });
  const reviewed = await shop({ name: "Reviewed Heat", slug: `find-rev-${uid()}` });
  const job = await prisma.job.create({
    data: {
      businessId: reviewed.id,
      title: "No cooling",
      status: "completed",
      completedAt: new Date(),
      customerConfirmToken: `rv-${uid()}`,
    },
  });
  const early = await leaveVisitReview({ token: job.customerConfirmToken, rating: 5, body: "On time." });
  assert.equal(early.ok, true);
  const again = await leaveVisitReview({ token: job.customerConfirmToken, rating: 1 });
  assert.equal(again.ok, false);
  const open = await prisma.job.create({
    data: { businessId: live.id, title: "Tune-up", status: "scheduled", customerConfirmToken: `op-${uid()}` },
  });
  assert.equal((await leaveVisitReview({ token: open.customerConfirmToken, rating: 5 })).ok, false);
  assert.equal((await leaveVisitReview({ token: "missing-token", rating: 5 })).status, 404);

  const found = await findShops({ trade: "HVAC", zip3: "606" });
  const names = found.map((row) => row.name);
  assert.ok(names.includes("North Side Heat"));
  assert.ok(names.includes("Reviewed Heat"));
  assert.equal(names.includes("No Number"), false);
  assert.equal(names.includes("Pipe Co"), false);
  assert.equal(names.includes("Far Heat"), false);
  assert.equal(names.includes("Test Heat"), false);
  assert.equal(names.includes("Closed Heat"), false);
  assert.equal(names[0], "Reviewed Heat", "a reviewed shop leads the list");
  const north = found.find((row) => row.name === "North Side Heat");
  assert.equal(north.bookingPath, `/b/${live.slug}`);
  assert.equal(north.reviewLine, null);
  assert.equal(found.find((row) => row.name === "Reviewed Heat").reviewLine, "5 from 1 finished visit");
  assert.ok(quiet.id && otherTrade.id && otherZip.id && testShop.id && canceled.id);
});

test("a customer who asks is one lead, taken once by a listed shop", async () => {
  const s = await shop({ name: "Claim Heat", slug: `find-claim-${uid()}` });
  const saved = await saveAreaRequest({
    trade: "HVAC",
    zip: "60614",
    name: "Rosa Diaz",
    phone: "3125550199",
    need: "The house has no heat.",
  });
  assert.equal(saved.ok, true);
  const again = await saveAreaRequest({
    trade: "HVAC",
    zip: "60614",
    name: "Rosa Diaz",
    phone: "3125550199",
    need: "The house has no heat.",
  });
  assert.equal(again.id, saved.id, "the same ask within a day is one request");

  const area = await shopArea(s.id);
  assert.equal(area.listed, true);
  assert.equal(area.waiting.length, 1);
  assert.match(areaCopy(area).join(" "), /Customers searching HVAC in 606xx find this shop/);
  assert.match(areaCopy(area).join(" "), /1 person asked/);

  const taken = await claimAreaRequest({ businessId: s.id, requestId: saved.id });
  const lead = await prisma.lead.findUnique({ where: { id: taken.leadId } });
  assert.equal(lead.businessId, s.id);
  assert.equal(lead.source, "find");
  assert.match(lead.notes, /no heat/i);
  await assert.rejects(() => claimAreaRequest({ businessId: s.id, requestId: saved.id }), AreaClaimError);

  const after = await shopArea(s.id);
  assert.equal(after.waiting.length, 0);
});
