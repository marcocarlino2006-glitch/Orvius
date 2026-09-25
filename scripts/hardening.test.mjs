#!/usr/bin/env node
/*
 * Metrics come from records and the audit trail; deletion removes exactly one
 * workspace; failed webhook auth is throttled without touching real traffic.
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

const { ingestEndOfCallReport } = await import("../src/lib/call-ingest.ts");
const { getOperatingMetrics } = await import("../src/lib/operating-metrics.ts");
const { checkWorkspaceDeletion, deleteWorkspace } = await import("../src/lib/workspace-deletion.ts");
const { webhookAuthFailureLimited, rateLimit } = await import("../src/lib/rate-limit.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

async function makeShop(overrides = {}) {
  return prisma.business.create({
    data: {
      name: `Hardening ${uid()}`,
      slug: `hard-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      ownerPhone: "+15550001111",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
      ...overrides,
    },
  });
}

function report(id, data) {
  return {
    type: "end-of-call-report",
    call: { id, customer: { number: data.phone } },
    summary: `${data.name} called about ${data.serviceType}.`,
    durationSeconds: 120,
    analysis: { structuredData: { ...data } },
  };
}

test("operating metrics are computed from what the loop recorded", async () => {
  const shop = await makeShop();
  try {
    await prisma.technician.create({ data: { businessId: shop.id, name: "Ana", skillsJson: "[]" } });
    await prisma.technician.create({ data: { businessId: shop.id, name: "Ben", skillsJson: "[]" } });
    const calls = [
      { name: "A One", phone: "+13125550111", serviceType: "AC not cooling", urgency: "same-day", address: "1 Elm St" },
      { name: "B Two", phone: "+13125550112", serviceType: "Furnace tune-up", urgency: "this-week", address: "2 Elm St" },
      { name: "C Three", phone: "+13125550113", serviceType: "Thermostat issue", urgency: "this-week", address: "3 Elm St" },
      { name: "D Four", phone: "+13125550114", serviceType: "I smell gas near the furnace", urgency: "same-day", address: "4 Elm St" },
      { name: "E Five", phone: "+13125550115", serviceType: "AC not cooling", urgency: "same-day" },
    ];
    for (const data of calls) {
      const id = `hard_${uid()}`;
      await ingestEndOfCallReport({ business: shop, vapiCallId: id, message: report(id, data) });
    }

    const metrics = Object.fromEntries((await getOperatingMetrics(shop.id)).map((m) => [m.key, m]));
    assert.equal(metrics.answer.value, 1);
    assert.equal(metrics.qualification.numerator, 4);
    assert.equal(metrics.qualification.denominator, 5);
    assert.equal(metrics.escalation.numerator, 2, "gas smell escalated, missing address held");
    assert.equal(metrics.recovered.value, 3);
    assert.equal(metrics.duplicates.numerator, 0);
    assert.equal(metrics.booking.denominator, 3);
    assert.equal(metrics.booking.value, null, "three bookings is below the reporting floor");
    assert.match(metrics.booking.note, /Needs 5\+/);
  } finally {
    await drop(shop.id);
  }
});

test("only the owner, naming the workspace, with no live subscription, can delete", () => {
  const business = { name: "Summit Air", ownerEmail: "owner@x.test", billingStatus: "none", stripeSubscriptionId: null };
  assert.equal(checkWorkspaceDeletion({ business, requesterEmail: "tech@x.test", confirm: "Summit Air" }).reason, "not_owner");
  assert.equal(checkWorkspaceDeletion({ business, requesterEmail: "owner@x.test", confirm: "Summit" }).reason, "confirm_mismatch");
  assert.equal(
    checkWorkspaceDeletion({
      business: { ...business, billingStatus: "active", stripeSubscriptionId: "sub_1" },
      requesterEmail: "OWNER@x.test",
      confirm: "summit air",
    }).reason,
    "active_subscription",
  );
  assert.equal(checkWorkspaceDeletion({ business, requesterEmail: "OWNER@x.test", confirm: " summit air " }).ok, true);
});

test("deleting a workspace removes all of its records and none of another's", async () => {
  const gone = await makeShop();
  const kept = await makeShop();
  try {
    for (const shop of [gone, kept]) {
      const id = `del_${uid()}`;
      await ingestEndOfCallReport({
        business: shop,
        vapiCallId: id,
        message: report(id, { name: "Pat", phone: "+13125550120", serviceType: "AC not cooling", urgency: "same-day", address: "9 Oak" }),
      });
    }
    await deleteWorkspace(gone.id, gone.ownerEmail);

    for (const model of ["call", "lead", "customer", "job", "auditEvent", "ownerNotification", "webhookEvent"]) {
      assert.equal(await prisma[model].count({ where: { businessId: gone.id } }), 0, `${model} left behind`);
    }
    assert.equal(await prisma.business.count({ where: { id: gone.id } }), 0);
    assert.equal(await prisma.lead.count({ where: { businessId: kept.id } }), 1);
    assert.equal(await prisma.job.count({ where: { businessId: kept.id } }), 1);
  } finally {
    await drop(gone.id);
    await drop(kept.id);
  }
});

test("failed webhook auth is throttled per source and address", () => {
  const request = new Request("https://x.test/api/webhooks/vapi", { headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` } });
  const results = Array.from({ length: 21 }, () => webhookAuthFailureLimited(request, "vapi-test"));
  assert.equal(results.slice(0, 20).every((r) => r.ok), true);
  assert.equal(results[20].ok, false);
  assert.ok(results[20].retryAfterSec >= 1);

  const key = `ask:${uid()}`;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit({ key, limit: 3, windowMs: 60_000 }).ok, true);
  assert.equal(rateLimit({ key, limit: 3, windowMs: 60_000 }).ok, false);
});

test.after(() => prisma.$disconnect());
