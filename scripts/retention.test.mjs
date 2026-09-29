/*
 * Retention (docs/BACKLOG.md F5): recordings and transcripts go after 24
 * months, here and at Vapi and Twilio; customer and technician links close
 * once the visit is behind the shop; a shop can reset its calendar feed link.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "retention-test-secret";

const { purgeExpiredCallContent, callContentCutoff } = await import("../src/lib/retention.ts");
const { confirmJobByCustomerToken } = await import("../src/lib/customer-confirm.ts");
const { techLinkExpired } = await import("../src/lib/ensure-tech-token.ts");
const { calendarFeedToken, verifyCalendarFeedToken, resetCalendarFeed } = await import("../src/lib/calendar-feed.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const DAY = 24 * 60 * 60 * 1000;
const MONTH = 31 * DAY;

async function makeShop() {
  return prisma.business.create({
    data: { name: "Keep Air", slug: `keep-${stamp()}`, environment: "test", ownerPhone: "+15125550177" },
  });
}
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

test("a call past 24 months loses its recording and transcript here and at Vapi; a newer one keeps them", async () => {
  const shop = await makeShop();
  try {
    const now = new Date();
    const old = await prisma.call.create({
      data: {
        businessId: shop.id,
        vapiCallId: `vapi-old-${stamp()}`,
        transcript: "My furnace is out",
        recordingUrl: "https://storage.vapi.ai/old.wav",
        summary: "No heat, booked",
        createdAt: new Date(now.getTime() - 25 * MONTH),
      },
    });
    const recent = await prisma.call.create({
      data: {
        businessId: shop.id,
        vapiCallId: `vapi-new-${stamp()}`,
        transcript: "AC is leaking",
        recordingUrl: "https://storage.vapi.ai/new.wav",
        createdAt: new Date(now.getTime() - 23 * MONTH),
      },
    });

    const deleted = [];
    await purgeExpiredCallContent({ now, deleteVapi: async (id) => (deleted.push(id), "deleted"), deleteTwilio: null });

    const oldAfter = await prisma.call.findUnique({ where: { id: old.id } });
    assert.equal(oldAfter.transcript, null);
    assert.equal(oldAfter.recordingUrl, null);
    assert.equal(oldAfter.summary, "No heat, booked");
    assert.ok(oldAfter.contentPurgedAt);
    assert.ok(deleted.includes(old.vapiCallId));

    const recentAfter = await prisma.call.findUnique({ where: { id: recent.id } });
    assert.equal(recentAfter.transcript, "AC is leaking");
    assert.equal(recentAfter.contentPurgedAt, null);
    assert.ok(!deleted.includes(recent.vapiCallId));
    assert.ok(callContentCutoff(now) > old.createdAt && callContentCutoff(now) < recent.createdAt);
  } finally {
    await drop(shop.id);
  }
});

test("when Vapi's delete fails the call is not marked purged, and the next run finishes it", async () => {
  const shop = await makeShop();
  try {
    const now = new Date();
    const call = await prisma.call.create({
      data: {
        businessId: shop.id,
        vapiCallId: `vapi-retry-${stamp()}`,
        transcript: "Thermostat blank",
        createdAt: new Date(now.getTime() - 30 * MONTH),
      },
    });

    await purgeExpiredCallContent({ now, deleteVapi: async () => { throw new Error("Vapi 503"); }, deleteTwilio: null });
    let row = await prisma.call.findUnique({ where: { id: call.id } });
    assert.equal(row.transcript, null, "our copy goes even while Vapi is down");
    assert.equal(row.contentPurgedAt, null, "not stamped until Vapi's copy is gone");

    await purgeExpiredCallContent({ now, deleteVapi: async () => "missing", deleteTwilio: null });
    row = await prisma.call.findUnique({ where: { id: call.id } });
    assert.ok(row.contentPurgedAt);
  } finally {
    await drop(shop.id);
  }
});

test("an old voicemail is deleted at Twilio and the lead note says so", async () => {
  const shop = await makeShop();
  try {
    const now = new Date();
    const sid = `RE${"a1".repeat(16)}`;
    const lead = await prisma.lead.create({
      data: {
        businessId: shop.id,
        name: "Pat",
        phone: "+15125550100",
        externalId: `voice-fallback:CA${stamp()}`,
        notes: `Missed call\nVoicemail (42s): https://api.twilio.com/2010-04-01/Accounts/ACx/Recordings/${sid}.mp3`,
        createdAt: new Date(now.getTime() - 26 * MONTH),
      },
    });

    const removed = [];
    await purgeExpiredCallContent({ now, deleteVapi: null, deleteTwilio: async (id) => (removed.push(id), "deleted") });

    assert.deepEqual(removed, [sid]);
    const after = await prisma.lead.findUnique({ where: { id: lead.id } });
    assert.equal(after.notes, "Missed call\nVoicemail (42s): deleted after 24 months");
  } finally {
    await drop(shop.id);
  }
});

test("a confirm link stops working a day after the visit or once the job is closed", async () => {
  const shop = await makeShop();
  try {
    const make = (scheduledAt, status = "scheduled") =>
      prisma.job.create({
        data: { businessId: shop.id, title: "Tune-up", status, scheduledAt, customerConfirmToken: `tok-${stamp()}` },
      });
    const past = await make(new Date(Date.now() - 2 * DAY));
    const closed = await make(new Date(Date.now() + DAY), "cancelled");
    const upcoming = await make(new Date(Date.now() + DAY));

    const pastResult = await confirmJobByCustomerToken(past.customerConfirmToken);
    assert.equal(pastResult.ok, false);
    assert.equal(pastResult.error, "expired");
    assert.equal((await prisma.job.findUnique({ where: { id: past.id } })).customerConfirmedAt, null);

    assert.equal((await confirmJobByCustomerToken(closed.customerConfirmToken)).error, "expired");

    const ok = await confirmJobByCustomerToken(upcoming.customerConfirmToken);
    assert.equal(ok.ok, true);
    assert.equal(ok.already, false);
  } finally {
    await drop(shop.id);
  }
});

test("a technician link closes when the job is cancelled or a week after the visit", () => {
  const now = new Date();
  assert.equal(techLinkExpired({ status: "scheduled", scheduledAt: new Date(now.getTime() + DAY) }, now), false);
  assert.equal(techLinkExpired({ status: "completed", scheduledAt: new Date(now.getTime() - 3 * DAY) }, now), false);
  assert.equal(techLinkExpired({ status: "completed", scheduledAt: new Date(now.getTime() - 8 * DAY) }, now), true);
  assert.equal(techLinkExpired({ status: "cancelled", scheduledAt: new Date(now.getTime() + DAY) }, now), true);
});

test("resetting the calendar feed kills the old link and the new one works", async () => {
  const shop = await makeShop();
  try {
    const original = calendarFeedToken(shop.id);
    assert.equal(await verifyCalendarFeedToken(`${original}.ics`), shop.id, "links issued before reset existed still verify");

    const nextUrl = await resetCalendarFeed(shop.id);
    const next = nextUrl.split("/").pop();
    assert.equal(await verifyCalendarFeedToken(original), null);
    assert.equal(await verifyCalendarFeedToken(next), shop.id);
    assert.notEqual(next.replace(/\.ics$/, ""), original);
  } finally {
    await drop(shop.id);
  }
});
