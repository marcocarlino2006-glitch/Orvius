/*
 * Multi-location operators and their auditors read these two views to decide
 * where to send people and who changed what. They drive the real functions
 * against the real database: a location counted under the wrong shop, a
 * filter that leaks another shop's rows, or a CSV cell a spreadsheet runs as a
 * formula are the failures that matter.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { auditLogCsv, listAuditLog, personActor, recordAudit } from "../src/lib/audit.ts";
import { getPortfolio } from "../src/lib/portfolio.ts";

const prisma = new PrismaClient();
const unique = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

test("the portfolio counts each location's own work over the window, and nothing it cannot open", async () => {
  const email = `${unique("operator")}@example.com`;
  const now = new Date();
  const old = new Date(now.getTime() - 20 * 86_400_000);
  const north = await prisma.business.create({ data: { name: "North HVAC", slug: unique("north"), ownerEmail: email, twilioPhone: "+15555550101", lineVerifiedAt: now } });
  const south = await prisma.business.create({ data: { name: "South HVAC", slug: unique("south"), ownerEmail: unique("other") + "@example.com" } });
  await prisma.membership.create({ data: { businessId: south.id, email, role: "manager" } });
  const stranger = await prisma.business.create({ data: { name: "Stranger HVAC", slug: unique("stranger"), ownerEmail: unique("x") + "@example.com" } });

  await prisma.call.createMany({
    data: [
      { businessId: north.id, direction: "inbound", createdAt: now },
      { businessId: north.id, direction: "inbound", createdAt: now },
      { businessId: north.id, direction: "inbound", createdAt: old },
      { businessId: south.id, direction: "inbound", createdAt: now },
      { businessId: stranger.id, direction: "inbound", createdAt: now },
    ],
  });
  // A row written by a SQL default stores its time as text; it must not break the page or pass for a real last call.
  const east = await prisma.business.create({ data: { name: "East HVAC", slug: unique("east"), ownerEmail: email } });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Call" ("id", "businessId", "direction", "createdAt", "updatedAt") VALUES (?, ?, 'inbound', '2026-01-01 00:00:00', ?)`,
    unique("legacy-call"),
    east.id,
    now.getTime(),
  );
  await prisma.lead.createMany({
    data: [
      { businessId: north.id, status: "new", urgency: "emergency" },
      { businessId: north.id, status: "new", createdAt: old },
      { businessId: north.id, status: "spam" },
      { businessId: south.id, status: "booked" },
    ],
  });
  await prisma.job.create({ data: { businessId: south.id, title: "Tune-up", status: "completed", completedAt: now } });
  await prisma.deposit.create({ data: { businessId: south.id, amountCents: 9900, status: "paid", paidAt: now } });

  const p = await getPortfolio(email, 7, now);
  assert.deepEqual(p.shops.map((s) => s.name).sort(), ["East HVAC", "North HVAC", "South HVAC"]);
  assert.equal(p.shops.find((x) => x.id === east.id).lastCallAt, null);
  const n = p.shops.find((s) => s.id === north.id);
  const s = p.shops.find((x) => x.id === south.id);
  assert.equal(n.role, "owner");
  assert.equal(s.role, "manager");
  assert.equal(n.calls, 2, "a call outside the window is not counted");
  assert.equal(n.lastCallAt, now.toISOString());
  assert.equal(s.lastCallAt, now.toISOString());
  assert.equal(n.leads, 1, "spam and old leads are not counted as new demand");
  assert.equal(n.waiting, 2, "waiting counts every lead with no callback, however old");
  assert.equal(n.waitingEmergencies, 1);
  assert.equal(n.lineLive, true);
  assert.equal(s.lineLive, false);
  assert.equal(s.booked, 1);
  assert.equal(s.completed, 1);
  assert.equal(s.collectedCents, 9900);
  assert.equal(p.totals.locations, 3);
  assert.equal(p.totals.linesDown, 2);

  const wide = await getPortfolio(email, 30, now);
  assert.equal(wide.shops.find((x) => x.id === north.id).calls, 3);
  assert.equal((await getPortfolio(email, 12345, now)).days, 7, "unknown windows fall back to 7 days");
});

test("the activity log filters, pages without gaps, and stays inside one shop", async () => {
  const shop = await prisma.business.create({ data: { name: "Audit Proof HVAC", slug: unique("audit") } });
  const other = await prisma.business.create({ data: { name: "Other HVAC", slug: unique("audit-other") } });
  const base = { entityType: "shop", entityId: shop.id };
  for (let i = 0; i < 7; i++) {
    await recordAudit({ businessId: shop.id, ...base, action: "call.answered", actor: "orvius", summary: `Answered call ${i}` });
  }
  await recordAudit({
    businessId: shop.id,
    ...base,
    action: "settings.changed",
    ...personActor({ role: "manager", email: "Mia@Example.com" }),
    summary: "mia@example.com changed opening line.",
  });
  await recordAudit({ businessId: other.id, entityType: "shop", entityId: other.id, action: "settings.changed", actor: "owner", summary: "Other shop change" });

  const people = await listAuditLog({ businessId: shop.id, actor: "teammate" });
  assert.equal(people.rows.length, 1);
  assert.equal(people.rows[0].actorEmail, "mia@example.com", "who acted is stored lowercased");

  assert.equal((await listAuditLog({ businessId: shop.id, q: "mia@" })).rows.length, 1, "search matches who acted");
  assert.equal((await listAuditLog({ businessId: shop.id, q: "Other shop" })).rows.length, 0, "another shop's rows never match");
  assert.equal((await listAuditLog({ businessId: shop.id, actor: "not-a-role" })).rows.length, 8, "unknown filters are ignored, not injected");

  const seen = [];
  let cursor = null;
  do {
    const page = await listAuditLog({ businessId: shop.id, take: 3, cursor });
    seen.push(...page.rows.map((r) => r.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(seen.length, 8);
  assert.equal(new Set(seen).size, 8, "paging neither repeats nor skips a row");
});

test("CSV export quotes commas and newlines and defuses spreadsheet formulas", () => {
  const csv = auditLogCsv([
    {
      id: "a",
      at: "2026-09-26T00:00:00.000Z",
      action: "settings.changed",
      actor: "owner",
      actorEmail: "o@example.com",
      summary: '=HYPERLINK("http://evil","x"), and "more"\nnext line',
      detail: { a: 1 },
      entityType: "shop",
      entityId: "s1",
      callId: null,
      leadId: null,
      customerId: null,
      jobId: null,
    },
  ]);
  const [head, row] = csv.split("\r\n");
  assert.equal(head, "time,action,actor,actor_email,entity_type,entity_id,summary,detail");
  assert.ok(row.includes(`"'=HYPERLINK(""http://evil"",""x""), and ""more""`), row);
  assert.ok(csv.includes('"{""a"":1}"'));
});
