#!/usr/bin/env node
/*
 * Autopilot and the Command queue: routine work is done and audited without
 * the owner; judgment calls stay on the queue; one late technician is one row.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const baseUrl =
  process.env.DATABASE_URL ??
  readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (baseUrl?.startsWith("file:") && !baseUrl.includes("socket_timeout")) {
  process.env.DATABASE_URL = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}connection_limit=1&socket_timeout=60`;
}
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { runAutopilot, listHandled, resetAutopilotThrottle } = await import("../src/lib/autopilot.ts");
const { getAttentionQueue } = await import("../src/lib/attention-queue.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
const inHours = (h) => new Date(Date.now() + h * 3600_000);

async function makeShop(data = {}) {
  return prisma.business.create({
    data: {
      name: "Autopilot HVAC",
      slug: `auto-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      billingStatus: "active",
      billingPlan: "pro",
      timezone: "America/Chicago",
      ...data,
    },
  });
}
const tech = (businessId, name, skills = []) =>
  prisma.technician.create({ data: { businessId, name, skillsJson: JSON.stringify(skills), phone: null } });
const job = (businessId, data = {}) =>
  prisma.job.create({
    data: {
      businessId,
      title: "AC not cooling",
      serviceType: "AC not cooling",
      urgency: "same-day",
      status: "scheduled",
      scheduledAt: inHours(20),
      durationMin: 90,
      address: "12 Oak St",
      ...data,
    },
  });

test.beforeEach(() => resetAutopilotThrottle());

test("a clear-cut job is assigned once and audited; the run is idempotent", async () => {
  const shop = await makeShop();
  try {
    const ana = await tech(shop.id, "Ana", ["cooling"]);
    await tech(shop.id, "Ben", ["heating"]);
    const j = await job(shop.id);

    const first = await runAutopilot(shop.id, { force: true });
    assert.equal(first.assigned, 1);
    assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: j.id } })).technicianId, ana.id);
    const audits = await prisma.auditEvent.findMany({ where: { jobId: j.id, action: "autopilot.assigned" } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actor, "orvius");
    assert.match(audits[0].summary, /Assigned Ana to AC not cooling — has the cooling skill/);

    const again = await runAutopilot(shop.id, { force: true });
    assert.equal(again.assigned, 0);
    assert.equal(await prisma.auditEvent.count({ where: { jobId: j.id, action: "autopilot.assigned" } }), 1);

    const handled = await listHandled(shop.id);
    assert.equal(handled.assigned, 1);
    assert.match(handled.events[0].summary, /Assigned Ana/);
  } finally {
    await drop(shop.id);
  }
});

test("ties, emergencies, safety calls, and past jobs stay with the owner", async () => {
  const shop = await makeShop();
  try {
    await tech(shop.id, "Chris");
    await tech(shop.id, "Dee");
    const tie = await job(shop.id, { title: "Tune-up", serviceType: "Tune-up" });
    const emergency = await job(shop.id, { urgency: "emergency", scheduledAt: inHours(3) });
    const gas = await job(shop.id, { title: "Smell gas near furnace", serviceType: "I smell gas near the furnace", scheduledAt: inHours(30) });
    const past = await job(shop.id, { scheduledAt: inHours(-3) });

    const ran = await runAutopilot(shop.id, { force: true });
    assert.equal(ran.assigned, 0);
    for (const j of [tie, emergency, gas, past]) {
      assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: j.id } })).technicianId, null, j.title);
    }
  } finally {
    await drop(shop.id);
  }
});

test("an owner who turns autopilot off gets no automatic actions", async () => {
  const shop = await makeShop({ autopilot: false });
  try {
    await tech(shop.id, "Ana", ["cooling"]);
    const j = await job(shop.id);
    assert.equal(await runAutopilot(shop.id, { force: true }), null);
    assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: j.id } })).technicianId, null);
  } finally {
    await drop(shop.id);
  }
});

test("runs are throttled per shop unless forced", async () => {
  const shop = await makeShop();
  try {
    assert.ok(await runAutopilot(shop.id));
    assert.equal(await runAutopilot(shop.id), null);
    assert.ok(await runAutopilot(shop.id, { force: true }));
  } finally {
    await drop(shop.id);
  }
});

test("the queue skips confirmations already waiting on the customer, but not ones about to start", async () => {
  const shop = await makeShop({ autopilot: false });
  try {
    const t = await tech(shop.id, "Ana");
    const customer = await prisma.customer.create({
      data: { businessId: shop.id, name: "Rosa", phone: "+13125550147", phoneNormalized: "+13125550147" },
    });
    const texted = await job(shop.id, { technicianId: t.id, customerId: customer.id, customerConfirmSentAt: new Date(), scheduledAt: inHours(20) });
    const soon = await job(shop.id, { technicianId: t.id, customerId: customer.id, customerConfirmSentAt: new Date(), scheduledAt: inHours(1), title: "Soon" });
    const never = await job(shop.id, { technicianId: t.id, scheduledAt: inHours(26), title: "Never texted" });

    const queue = await getAttentionQueue(shop.id, 40);
    const confirmIds = queue.filter((i) => i.kind === "needs_customer_confirm").map((i) => i.entityId);
    assert.ok(!confirmIds.includes(texted.id), "Orvius already texted; the owner has nothing to do");
    assert.ok(confirmIds.includes(soon.id) || queue.some((i) => i.entityId === soon.id), "an hour out, a person should call");
    assert.ok(confirmIds.includes(never.id));
  } finally {
    await drop(shop.id);
  }
});

test("with autopilot on, the owner sees only confirmations autopilot will not send, and no proof ask in week one", async () => {
  const shop = await makeShop({ autopilot: true });
  try {
    const t = await tech(shop.id, "Ana");
    const later = await job(shop.id, { technicianId: t.id, scheduledAt: inHours(26), title: "Later" });
    const soon = await job(shop.id, { technicianId: t.id, scheduledAt: inHours(1), title: "Soon" });
    await prisma.lead.create({ data: { businessId: shop.id, name: "Rosa", phone: "+13125550147", source: "call" } });

    const queue = await getAttentionQueue(shop.id, 40);
    const confirmIds = queue.filter((i) => i.kind === "needs_customer_confirm").map((i) => i.entityId);
    assert.ok(!confirmIds.includes(later.id), "autopilot texts this one; it is not the owner's decision");
    assert.ok(confirmIds.includes(soon.id), "an hour out, a person should call");
    assert.ok(!queue.some((i) => i.kind === "stale_weekly_proof"), "a shop in its first week has nothing to prove");

    await prisma.business.update({ where: { id: shop.id }, data: { createdAt: new Date(Date.now() - 8 * 86_400_000) } });
    const weekTwo = await getAttentionQueue(shop.id, 40);
    assert.ok(weekTwo.some((i) => i.kind === "stale_weekly_proof"));
  } finally {
    await drop(shop.id);
  }
});

test("one late technician is one row, with the rest folded behind it", async () => {
  const shop = await makeShop({ autopilot: false });
  try {
    const chris = await tech(shop.id, "Chris Lee");
    await prisma.technician.update({ where: { id: chris.id }, data: { phone: "+13125550133" } });
    const a = await prisma.customer.create({ data: { businessId: shop.id, name: "Dana", phone: "+13125550146", phoneNormalized: "+13125550146" } });
    const b = await prisma.customer.create({ data: { businessId: shop.id, name: "Lee", phone: "+13125550148", phoneNormalized: "+13125550148" } });
    await job(shop.id, { technicianId: chris.id, customerId: a.id, scheduledAt: inHours(-3), title: "Duct cleaning" });
    await job(shop.id, { technicianId: chris.id, customerId: b.id, scheduledAt: inHours(-2), title: "Humidifier install" });

    const late = (await getAttentionQueue(shop.id, 40)).filter((i) => i.kind === "tech_no_show");
    assert.equal(late.length, 1);
    assert.equal(late[0].rolledUp, 1);
    assert.equal(late[0].title, "Chris Lee");
  } finally {
    await drop(shop.id);
  }
});

test.after(() => prisma.$disconnect());
