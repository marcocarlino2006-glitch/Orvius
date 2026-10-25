/*
 * The next shop: a busy line keeps the caller's number, and an empty network
 * hands the owner a link that lands the next shop in the same trade and ZIP3.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}

const { shopLineBusySay } = await import("../src/lib/shop-machine.ts");
const { callSpendCut, holdLineBusyCaller } = await import("../src/lib/call-spend-guard.ts");
const { invitePageLine, inviteQuery, inviteSetupLine } = await import("../src/lib/acquisition.ts");
const { nextShopInvite } = await import("../src/lib/referrals.ts");
const { startSetup } = await import("../src/lib/setup-sandbox.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a known number is a callback, and a blank one is asked to try again", () => {
  assert.match(shopLineBusySay("Ray's Heating", true), /We have your number and will call you back/);
  const unnamed = shopLineBusySay("Ray's Heating");
  assert.match(unnamed, /Please try again in a few minutes/);
  assert.doesNotMatch(unnamed, /call you back/);
  const area = inviteQuery("hvac", "10001");
  assert.deepEqual(area, { trade: "HVAC", zip3: "100" });
  assert.equal(inviteQuery("roofing", "10001"), null);
  assert.equal(inviteQuery("HVAC", "10"), null);
  assert.equal(invitePageLine("Ray's Heating", area), "Ray's Heating is booked near 100xx and needs another HVAC shop.");
  assert.equal(
    inviteSetupLine(area),
    "An HVAC shop near 100xx sent you. Choose HVAC and this shop starts in that area.",
  );
  const invite = nextShopInvite({ slug: "rays-heating", trade: "Electrical", zip3: "100" });
  assert.match(invite.line, /No other Orvius Electrical shop near 100xx yet/);
  assert.match(invite.url, /\/r\/rays-heating\?via=network&trade=Electrical&zip=100$/);
});

test("the busy line, the invite, and the saved area are wired where the owner meets them", () => {
  const hook = read("src/app/api/webhooks/vapi/route.ts");
  const ended = hook.indexOf("await endCallWith(controlUrl, cut.say)");
  const held = hook.indexOf("holdLineBusyCaller({");
  assert.ok(ended > 0 && held > ended, "the number is kept after the caller is hung up");
  assert.match(read("src/lib/call-spend-guard.ts"), /source: "busy_line"/);
  assert.match(read("src/app/api/account/route.ts"), /resolveNetworkSave\(/);
  assert.match(read("src/lib/network-choice.ts"), /derived \?\? storedZip/);
  assert.match(read("src/lib/setup-sandbox.ts"), /networkZip3: invite\.zip3/);
  assert.match(read("src/app/api/setup/route.ts"), /inviteArea\(parseAcquisition/);
  assert.match(read("src/app/r/[code]/page.tsx"), /invitePageLine/);
  assert.match(read("src/components/turn-on-orvius.tsx"), /inviteSetupLine/);
  assert.match(read("src/lib/call-ingest.ts"), /slug: business\.slug/);
});

test("a second caller is saved, and the owner is told to call back", async () => {
  const id = stamp();
  const phone = `+1555${String(2_000_000 + Math.floor(Math.random() * 7e6)).padStart(7, "0")}`.slice(0, 12);
  const other = `+1555${String(3_000_000 + Math.floor(Math.random() * 7e6)).padStart(7, "0")}`.slice(0, 12);
  const shop = await prisma.business.create({
    data: { name: `Busy ${id}`, slug: `busy-${id}`, ownerEmail: `busy-${id}@next.invalid`, ownerPhone: "+15555550100" },
  });
  const line = `line-${id}`;
  const now = new Date();
  try {
    const open = await callSpendCut({
      shop: { id: line, name: shop.name, ownerPhone: null, transferPhone: null },
      callerPhone: phone,
      vapiCallId: `vc-${id}-1`,
      ownsLine: true,
      now,
    });
    assert.equal(open, null);
    const cut = await callSpendCut({
      shop: { id: line, name: shop.name, ownerPhone: null, transferPhone: null },
      callerPhone: phone,
      vapiCallId: `vc-${id}-2`,
      ownsLine: true,
      now,
    });
    assert.equal(cut.reason, "shop_line");
    assert.match(cut.say, /We have your number and will call you back/);
    const blank = await callSpendCut({
      shop: { id: line, name: shop.name, ownerPhone: null, transferPhone: null },
      callerPhone: null,
      vapiCallId: `vc-${id}-3`,
      ownsLine: true,
      now,
    });
    assert.match(blank.say, /Please try again in a few minutes/);

    const call = await prisma.call.create({
      data: { businessId: shop.id, vapiCallId: `vc-hold-${id}`, callerPhone: phone, status: "in-progress" },
    });
    const held = await holdLineBusyCaller({
      shop: { id: shop.id, name: shop.name, ownerPhone: shop.ownerPhone, ownerEmail: shop.ownerEmail },
      callerPhone: phone,
      callId: call.id,
      now,
    });
    const lead = await prisma.lead.findUnique({ where: { id: held.leadId } });
    assert.equal(lead.source, "busy_line");
    assert.equal(lead.phone, phone);
    assert.equal(lead.callId, call.id);
    assert.match(lead.notes, /number was kept/);

    const again = await holdLineBusyCaller({
      shop: { id: shop.id, name: shop.name, ownerPhone: shop.ownerPhone, ownerEmail: shop.ownerEmail },
      callerPhone: phone,
      callId: call.id,
      now,
    });
    assert.equal(again.leadId, held.leadId, "the same number inside two hours is one lead");
    const alerts = await prisma.ownerNotification.count({
      where: { businessId: shop.id, dedupeKey: { startsWith: `busy-line:${shop.id}:${phone}:` } },
    });
    assert.equal(alerts, 2, "one text and one email, not a second hour of alerts");
    const message = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, leadId: held.leadId } });
    assert.match(message.message, /Call them back/);
    assert.doesNotMatch(message.message, /robodialer/);

    const sibling = await holdLineBusyCaller({
      shop: { id: shop.id, name: shop.name, ownerPhone: shop.ownerPhone, ownerEmail: shop.ownerEmail },
      callerPhone: other,
      callId: call.id,
      now,
    });
    const siblingLead = await prisma.lead.findUnique({ where: { id: sibling.leadId } });
    assert.equal(siblingLead.callId, null, "a taken call id does not block the second number");
    assert.equal(siblingLead.phone, other);
    assert.equal(await holdLineBusyCaller({ shop, callerPhone: "nope", now }), null);
  } finally {
    await prisma.provisionAttempt.deleteMany({ where: { key: `shop-line:${line}` } });
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => undefined);
  }
});

test("setup joins the sending shop's area only when the owner picks that trade", async () => {
  const owner = `next-${stamp()}@setup.invalid`;
  const other = `other-${stamp()}@setup.invalid`;
  const ids = [];
  try {
    const joined = await startSetup(owner, {
      name: "Next Electrical",
      trade: "Electrical",
      invite: { trade: "Electrical", zip3: "100" },
    });
    ids.push(joined.id);
    assert.equal(joined.networkOn, true);
    assert.equal(joined.networkZip3, "100");
    assert.equal(joined.environment, "test");

    const mismatched = await startSetup(other, {
      name: "Wrong Trade",
      trade: "Plumbing",
      invite: { trade: "Electrical", zip3: "100" },
    });
    ids.push(mismatched.id);
    assert.equal(mismatched.networkOn, false);
    assert.equal(mismatched.networkZip3, null);

    const switched = await startSetup(owner, {
      name: "Next Electrical",
      trade: "Plumbing",
      invite: { trade: "Electrical", zip3: "100" },
    });
    assert.equal(switched.id, joined.id);
    assert.equal(switched.networkOn, false);
    assert.equal(switched.networkZip3, null);

    const back = await startSetup(owner, {
      name: "Next Electrical",
      trade: "Electrical",
      invite: { trade: "Electrical", zip3: "100" },
    });
    assert.equal(back.networkOn, true);
    assert.equal(back.networkZip3, "100");
    assert.equal((await startSetup(owner, { name: "Next Electrical", trade: "Electrical", invite: { trade: "Electrical", zip3: "12" } })).networkZip3, "100");
  } finally {
    if (ids.length) await prisma.business.deleteMany({ where: { id: { in: ids } } });
  }
});
