#!/usr/bin/env node
/*
 * The public gallery of real calls and the launch page around it: only words
 * go public, with the caller's name, number and address hidden; nothing is
 * listed until the owner confirms the caller agreed and Orvius reviews it; the
 * owner can take it down at any time; and the launch page never shows a
 * capacity number nobody set.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { maskCustomerCall } from "../src/lib/call-replay-copy.ts";
import { galleryDraft, getGalleryCall, GalleryRefused, listGallery, reviewGalleryCall, shareToGallery, withdrawFromGallery } from "../src/lib/call-gallery.ts";
import { launchCapacity, monthlyShopCapacity } from "../src/lib/launch-capacity.ts";
import { can } from "../src/lib/workspace-access-labels.ts";

const prisma = new PrismaClient();
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

const TRANSCRIPT = [
  "AI: Thanks for calling Gallery Air, this is the after-hours line. What's going on?",
  "User: Hi, this is Dana Whitfield, my AC quit and it's 90 degrees in here.",
  "AI: Sorry to hear that, Dana. What's the address?",
  "User: 4120 Maple Ridge Drive, Austin 78704. Call me back at 512-555-0142 or dana.w@example.com.",
  "AI: Got it. I can get a tech out tomorrow at 9 AM. Does that work?",
  "User: Yes please.",
].join("\n");

async function shopWithCall(overrides = {}) {
  const shop = await prisma.business.create({
    data: { name: "Gallery Air", slug: `ga-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "test" },
  });
  made.push(shop.id);
  const phone = `+1512555${String(Date.now()).slice(-4)}`;
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name: "Dana Whitfield", phone, phoneNormalized: phone, address: "4120 Maple Ridge Drive, Austin TX" } });
  const call = await prisma.call.create({
    data: { businessId: shop.id, customerId: customer.id, status: "ended", durationSec: 140, booked: true, transcript: TRANSCRIPT, ...overrides },
  });
  return { shop, call };
}

test("a real customer's call loses their name, number, email, street and ZIP, and keeps the rest", () => {
  const known = ["Dana Whitfield", "4120 Maple Ridge Drive, Austin TX"];
  const out = maskCustomerCall("Hi, this is Dana Whitfield at 4120 Maple Ridge Drive, Austin 78704. Call 512-555-0142 or dana.w@example.com. My AC quit.", known);
  for (const leaked of ["Dana", "Whitfield", "4120", "Maple", "Austin", "78704", "0142", "example.com"]) assert.ok(!out.includes(leaked), `${leaked} is hidden: ${out}`);
  assert.match(out, /My AC quit\./);
  assert.equal(maskCustomerCall("Someone at 88 Oak St needs a plumber", []), "Someone at ••• needs a plumber", "unknown street addresses are hidden too");
  assert.equal(maskCustomerCall("Danaher Plumbing", ["Dana"]), "Danaher Plumbing", "only whole words are masked");
});

test("nothing is public until the owner confirms the caller agreed and Orvius lists it", async () => {
  const { shop, call } = await shopWithCall();
  const view = await galleryDraft(shop.id, call.id);
  assert.equal(view.shareable, true);
  const words = view.draft.turns.map((t) => t.text).join(" ");
  assert.ok(!/Dana|Whitfield|Maple|0142|78704/.test(words), words);
  assert.equal(view.draft.capture.outcome, "Booked");

  await assert.rejects(shareToGallery({ businessId: shop.id, callId: call.id, sharedByEmail: "o@x.test", callerAgreed: false }), GalleryRefused);
  const row = await shareToGallery({ businessId: shop.id, callId: call.id, sharedByEmail: "O@X.test", callerAgreed: true });
  assert.equal(row.status, "pending");
  assert.equal(row.sharedByEmail, "o@x.test");
  assert.ok(row.callerConsentAt instanceof Date);
  assert.equal(await getGalleryCall(row.id), null, "pending calls aren't public");
  assert.ok(!(await listGallery()).some((c) => c.id === row.id));
  const again = await shareToGallery({ businessId: shop.id, callId: call.id, sharedByEmail: "o@x.test", callerAgreed: true });
  assert.equal(again.id, row.id, "sharing twice is one entry");

  assert.equal(await reviewGalleryCall(row.id, "listed"), true);
  const pub = await getGalleryCall(row.id);
  assert.equal(pub.kind, "shop");
  assert.equal(pub.shopName, "Gallery Air");
  assert.ok((await listGallery()).some((c) => c.id === row.id));
  const stored = await prisma.galleryCall.findUnique({ where: { id: row.id } });
  assert.ok(!/Dana|Maple|512-555/.test(stored.turnsJson), "only masked words are stored");

  assert.equal(await withdrawFromGallery(shop.id, call.id), true);
  assert.equal(await getGalleryCall(row.id), null, "the owner takes it down immediately");
  const back = await shareToGallery({ businessId: shop.id, callId: call.id, sharedByEmail: "o@x.test", callerAgreed: true });
  assert.equal(back.status, "pending", "re-sharing goes back through review");

  assert.equal(await reviewGalleryCall(row.id, "removed"), true);
  await assert.rejects(shareToGallery({ businessId: shop.id, callId: call.id, sharedByEmail: "o@x.test", callerAgreed: true }), /can't be shared again/);
});

test("another shop can't read, share or take down someone else's call", async () => {
  const { call } = await shopWithCall();
  const { shop: other } = await shopWithCall();
  assert.equal((await galleryDraft(other.id, call.id)).shareable, false);
  await assert.rejects(shareToGallery({ businessId: other.id, callId: call.id, sharedByEmail: "x@x.test", callerAgreed: true }), GalleryRefused);
  assert.equal(await withdrawFromGallery(other.id, call.id), false);
});

test("calls without words to show, or deleted under retention, can't be shared", async () => {
  const { shop, call } = await shopWithCall({ transcript: "AI: Hello?\nUser: Hi" });
  assert.equal((await galleryDraft(shop.id, call.id)).shareable, false);
  const { shop: s2, call: purged } = await shopWithCall({ contentPurgedAt: new Date() });
  assert.equal((await galleryDraft(s2.id, purged.id)).shareable, false);
});

test("only the owner can put a shop's call in public", () => {
  assert.equal(can("owner", "calls.publish"), true);
  assert.equal(can("manager", "calls.publish"), false);
  assert.equal(can("dispatcher", "calls.publish"), false);
  const route = read("src/app/api/calls/[id]/gallery/route.ts");
  assert.equal((route.match(/requirePermission\("calls\.publish"/g) ?? []).length, 3);
  assert.match(route, /recordAudit/);
  assert.match(read("src/app/api/admin/gallery/route.ts"), /verifyAdminRequest[\s\S]*isFounderEmail/);
});

test("the launch page shows a capacity only when the founder set one, and counts real shops", async () => {
  const saved = process.env.ORVIUS_MONTHLY_SHOP_CAPACITY;
  delete process.env.ORVIUS_MONTHLY_SHOP_CAPACITY;
  assert.equal(monthlyShopCapacity(), null);
  assert.deepEqual(await launchCapacity(new Date("2026-10-09T12:00:00Z")), { capacity: null, taken: 0, left: null, month: "October" });
  process.env.ORVIUS_MONTHLY_SHOP_CAPACITY = "100000";
  const now = new Date();
  const before = await launchCapacity(now);
  const real = await prisma.business.create({ data: { name: "Real Shop", slug: `rs-${stamp()}`, trade: "HVAC", hoursJson: "{}", timezone: "America/Chicago", servicesJson: "[]", environment: "production" } });
  made.push(real.id);
  const after = await launchCapacity(now);
  assert.equal(after.taken, before.taken + 1, "a production shop takes a spot; test shops don't");
  assert.equal(after.left, 100000 - after.taken);
  if (saved === undefined) delete process.env.ORVIUS_MONTHLY_SHOP_CAPACITY;
  else process.env.ORVIUS_MONTHLY_SHOP_CAPACITY = saved;
});

test("the launch page and gallery make no promise the product can't keep and stage nothing", () => {
  for (const file of ["src/app/launch/page.tsx", "src/app/calls/page.tsx", "src/components/gallery-grid.tsx", "src/components/talk-in-browser.tsx"]) {
    const src = read(file);
    assert.doesNotMatch(src, /never miss|guarantee|100%|fully autonomous/i, file);
  }
  const launch = read("src/app/launch/page.tsx");
  assert.match(launch, /listGallery/, "the gallery strip shows real shared calls only");
  assert.match(launch, /ORVIUS_LAUNCH_VIDEO_URL/, "no video is shown until one is set");
  assert.match(launch, /sample data/, "the demo shop is labelled as sample data");
});
