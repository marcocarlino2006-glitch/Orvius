/*
 * The Vapi webhook answers once the call is saved and books afterwards
 * (docs/BACKLOG.md S2). These pin that a saved call is never left unbooked
 * and unalerted if the work after the response dies, and that finishing
 * twice cannot double a job or an alert.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { captureEndOfCallReport, finishCallReport, sweepUnfinishedCallReports } = await import("../src/lib/call-ingest.ts");

const prisma = new PrismaClient();
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const uid = () => Math.random().toString(36).slice(2, 10);

async function makeShop() {
  const shop = await prisma.business.create({
    data: {
      name: "Finish Test Air",
      slug: `finish-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      timezone: "America/Chicago",
      ownerPhone: "+15550004444",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
    },
  });
  await prisma.technician.create({ data: { businessId: shop.id, name: "Tech One", skillsJson: "[]" } });
  return shop;
}
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

const BOOKING = {
  name: "Ann Lee",
  phone: "+15125550101",
  serviceType: "AC not cooling",
  urgency: "same-day",
  address: "12 Oak St, Austin TX 78701",
};
const report = (vapiCallId) => ({
  type: "end-of-call-report",
  call: { id: vapiCallId, customer: { number: BOOKING.phone } },
  summary: "Ann Lee called about AC not cooling.",
  transcript: "User: my AC is not cooling",
  durationSeconds: 120,
  analysis: { structuredData: BOOKING },
});
const event = (vapiCallId) =>
  prisma.webhookEvent.findUniqueOrThrow({
    where: { source_externalId_eventType: { source: "vapi", externalId: vapiCallId, eventType: "end-of-call-report" } },
  });

test("capture saves the call and lead only, and a redelivery is a duplicate", async () => {
  const shop = await makeShop();
  try {
    const vapiCallId = `finish-cap-${uid()}`;
    const captured = await captureEndOfCallReport({ business: shop, vapiCallId, message: report(vapiCallId) });
    assert.equal(captured.duplicate, false);
    assert.equal(captured.lead.phone, BOOKING.phone);
    assert.equal((await event(vapiCallId)).status, "captured");
    assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 0);

    const again = await captureEndOfCallReport({ business: shop, vapiCallId, message: report(vapiCallId) });
    assert.equal(again.duplicate, true);

    const done = await finishCallReport(captured);
    assert.equal(done.autoBooked, true);
    assert.equal((await event(vapiCallId)).status, "processed");
    assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 1);
    assert.ok(await prisma.ownerNotification.count({ where: { leadId: captured.lead.id } }));
  } finally {
    await drop(shop.id);
  }
});

test("a call whose finishing died is booked and alerted by the sweep, once", async () => {
  const shop = await makeShop();
  try {
    const vapiCallId = `finish-sweep-${uid()}`;
    const captured = await captureEndOfCallReport({ business: shop, vapiCallId, message: report(vapiCallId) });
    const ev = await event(vapiCallId);

    await sweepUnfinishedCallReports();
    assert.equal((await event(vapiCallId)).status, "captured", "a call still inside its grace window is left alone");

    await prisma.webhookEvent.update({ where: { id: ev.id }, data: { createdAt: new Date(Date.now() - 6 * 60_000) } });
    await sweepUnfinishedCallReports();
    assert.equal((await event(vapiCallId)).status, "processed");
    assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 1);
    const alerts = await prisma.ownerNotification.count({ where: { leadId: captured.lead.id } });
    assert.ok(alerts > 0);

    await sweepUnfinishedCallReports();
    await finishCallReport(captured);
    assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 1, "finishing again adds no job");
    assert.equal(await prisma.ownerNotification.count({ where: { leadId: captured.lead.id } }), alerts, "or alert");
  } finally {
    await drop(shop.id);
  }
});

test("calls that were never saved don't starve the sweep of newer calls behind them", async () => {
  const shop = await makeShop();
  const stuckIds = [];
  try {
    const old = new Date(Date.now() - 60 * 60_000);
    for (let i = 0; i < 30; i += 1) {
      const row = await prisma.webhookEvent.create({
        data: {
          source: "vapi",
          eventType: "end-of-call-report",
          externalId: `finish-stuck-${uid()}-${i}`,
          status: "failed",
          createdAt: new Date(old.getTime() + i),
        },
      });
      stuckIds.push(row.id);
    }
    const vapiCallId = `finish-behind-${uid()}`;
    await captureEndOfCallReport({ business: shop, vapiCallId, message: report(vapiCallId) });
    const ev = await event(vapiCallId);
    await prisma.webhookEvent.update({ where: { id: ev.id }, data: { createdAt: new Date(Date.now() - 6 * 60_000) } });

    await sweepUnfinishedCallReports();
    assert.equal((await event(vapiCallId)).status, "processed", "the real call behind 30 unsaved ones still finishes");
    assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 1);
  } finally {
    await prisma.webhookEvent.deleteMany({ where: { id: { in: stuckIds } } });
    await drop(shop.id);
  }
});

test("the webhook answers Vapi before booking, and the drains run the sweep", () => {
  const route = read("src/app/api/webhooks/vapi/route.ts");
  assert.doesNotMatch(route, /await ingestEndOfCallReport/);
  const capture = route.indexOf("await captureEndOfCallReport(");
  const finish = route.indexOf("finishCallReport(captured)");
  assert.ok(capture > 0 && finish > capture);
  assert.ok(route.lastIndexOf("after(", finish) > capture, "finishing runs after the response");
  assert.match(read("src/lib/drain-owner-alerts.ts"), /sweepUnfinishedCallReports\(\)/);
  assert.match(read("src/app/api/cron/notifications/route.ts"), /sweepUnfinishedCallReports\(\)/);
});

test.after(() => prisma.$disconnect());
