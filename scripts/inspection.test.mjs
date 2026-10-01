/*
 * Fixes from the four-way inspection: a confirm link's GET never confirms,
 * prospect import is founder-only when no allowlist is set, a fallback call
 * saved without its alert still reaches the owner, quiet lines get a 5-minute
 * alert drain, and line watch reaches every shop rather than the first 200.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { confirmJobByCustomerToken } = await import("../src/lib/customer-confirm.ts");
const { alertStrandedTextLeads } = await import("../src/lib/stranded-lead-alerts.ts");

const prisma = new PrismaClient();
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

test("reading a confirm link does not confirm the visit; only the page's POST does", async () => {
  const shop = await prisma.business.create({
    data: { name: "Peek Air", slug: `peek-${stamp()}`, environment: "test", timezone: "America/Chicago" },
  });
  try {
    const token = `tok_${stamp()}`;
    const job = await prisma.job.create({
      data: {
        businessId: shop.id,
        title: "AC repair",
        status: "scheduled",
        scheduledAt: new Date(Date.now() + 86_400_000),
        customerConfirmToken: token,
      },
    });
    const peek = await confirmJobByCustomerToken(token, new Date(), { readOnly: true });
    assert.equal(peek.ok, true);
    assert.equal(peek.already, false);
    const untouched = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(untouched.customerConfirmedAt, null);
    assert.equal(untouched.status, "scheduled");

    const confirmed = await confirmJobByCustomerToken(token);
    assert.equal(confirmed.ok && confirmed.job.status, "confirmed");

    const route = read("src/app/api/public/confirm/[token]/route.ts");
    const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    assert.match(get, /readOnly: true/);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("prospect import with no allowlist is founder-only, not any signed-in user", () => {
  const route = read("src/app/api/waitlist/import/route.ts");
  assert.doesNotMatch(route, /allowed\.size === 0\) return true/);
  assert.match(route, /allowed\.size === 0\) return isFounderEmail\(email\)/);
});

test("a fallback call saved without its owner alert gets one, once", async () => {
  const shop = await prisma.business.create({
    data: { name: "Fallback Air", slug: `fb-${stamp()}`, environment: "production", ownerPhone: "+15555550170", timezone: "America/Chicago" },
  });
  try {
    const lead = await prisma.lead.create({
      data: {
        businessId: shop.id,
        source: "voice-fallback",
        externalId: `voice-fallback:CA${stamp()}`,
        phone: "+15555550171",
        createdAt: new Date(Date.now() - 5 * 60_000),
      },
    });
    await alertStrandedTextLeads();
    const rows = await prisma.ownerNotification.findMany({ where: { businessId: shop.id } });
    assert.ok(rows.length > 0);
    assert.deepEqual([...new Set(rows.map((r) => r.leadId))], [lead.id]);
    assert.match(rows[0].message, /Missed call from \+15555550171/);
    await alertStrandedTextLeads();
    assert.equal(await prisma.ownerNotification.count({ where: { businessId: shop.id } }), rows.length);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("quiet lines get the alert ladder advanced every 5 minutes, behind CRON_SECRET", () => {
  const workflow = read(".github/workflows/alert-drain.yml");
  assert.match(workflow, /cron: "\*\/5 \* \* \* \*"/);
  assert.match(workflow, /\/api\/cron\/alert-drain/);
  const route = read("src/app/api/cron/alert-drain/route.ts");
  assert.match(route, /isUnauthenticatedAccessAllowed\(\)/);
  assert.match(route, /drainOwnerAlerts\(/);
  assert.match(read("vercel.json"), /"schedule"/);
  assert.doesNotMatch(read("vercel.json"), /alert-drain/, "sub-daily Vercel crons fail the build on this plan");
});

test("line watch rotates through every shop and keeps calendars warm for live calls", () => {
  const watch = read("src/lib/line-watch.ts");
  assert.doesNotMatch(watch.slice(watch.indexOf("export async function watchAllLines")), /take: 200/);
  assert.match(watch, /skip: window \* WATCH_WINDOW/);
  assert.match(read("src/app/api/cron/line-watch/route.ts"), /refreshStaleBusyCalendars\(/);
});

test("hot-path indexes ship to Turso as well as the Prisma schema", () => {
  const sql = read("prisma/turso-migrate.sql");
  for (const name of [
    "Call_businessId_heldSlotAt_idx",
    "Lead_businessId_status_createdAt_idx",
    "WebhookEvent_source_eventType_status_createdAt_idx",
    "OwnerNotification_deliveryId_idx",
  ]) {
    assert.match(sql, new RegExp(`CREATE INDEX IF NOT EXISTS "${name}"`));
  }
});
