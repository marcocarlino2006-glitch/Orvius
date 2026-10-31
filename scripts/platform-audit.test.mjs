#!/usr/bin/env node
/*
 * Every change made from the founder console or with the admin key leaves a
 * row: who, what, which shop. Reads are not recorded, and a failed audit write
 * never fails the change itself.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.ORVIUS_ADMIN_KEY = "audit-test-key";
process.env.ORVIUS_FOUNDER_EMAILS = "founder@orvius.test";

const { founderActor, privilegedActor, recordPlatformAudit, recentPlatformAudit } = await import("../src/lib/platform-audit.ts");

const prisma = new PrismaClient();
const tag = `audit-test-${Date.now()}`;

test.after(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { action: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("only founders count as founders, normalized", () => {
  assert.deepEqual(founderActor(" Founder@Orvius.test "), { actorKind: "founder", actorEmail: "founder@orvius.test" });
  assert.equal(founderActor("someone@else.test"), null);
  assert.equal(founderActor(null), null);
});

test("the admin key is recorded as the admin key, before any session is read", async () => {
  const request = new Request("https://orvius.im/api/businesses", { headers: { "x-orvius-admin-key": "audit-test-key" } });
  assert.deepEqual(await privilegedActor(request), { actorKind: "admin_key", actorEmail: null });
});

test("a change writes who, what, which shop and the detail, newest first", async () => {
  await recordPlatformAudit({ actorKind: "founder", actorEmail: "founder@orvius.test" }, {
    action: `${tag}.first`,
    summary: "Created Summit HVAC (summit)",
    businessId: "biz_1",
    detail: { slug: "summit" },
  });
  await recordPlatformAudit(null, { action: `${tag}.second`, summary: "x".repeat(900) });

  const rows = await prisma.platformAuditEvent.findMany({ where: { action: { startsWith: tag } }, orderBy: { createdAt: "asc" } });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].actorKind, "founder");
  assert.equal(rows[0].actorEmail, "founder@orvius.test");
  assert.equal(rows[0].businessId, "biz_1");
  assert.deepEqual(JSON.parse(rows[0].detailJson), { slug: "summit" });
  assert.equal(rows[1].actorKind, "admin_key", "no actor falls back to the key, the only other way in");
  assert.equal(rows[1].summary.length, 500);
  assert.equal(rows[1].detailJson, null);

  const recent = await recentPlatformAudit(500);
  assert.ok(recent.some((row) => row.action === `${tag}.first`));
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every privileged change route records itself", () => {
  const wired = {
    "src/app/api/businesses/route.ts": ["admin.shop.created", "admin.shop.deleted", "admin.shop.updated"],
    "src/app/api/waitlist/route.ts": ["admin.waitlist.status_set"],
    "src/app/api/waitlist/import/route.ts": ["admin.waitlist.imported"],
    "src/app/api/admin/purge-seeds/route.ts": ["admin.waitlist.seeds_purged"],
    "src/app/api/admin/repair-lines/route.ts": ["admin.lines.repaired"],
    "src/app/api/admin/toll-free/route.ts": ["admin.toll_free.submitted"],
    "src/app/api/admin/line-fallback/route.ts": ["admin.lines.fallback_set"],
    "src/app/api/admin/gallery/route.ts": ["admin.gallery."],
    "src/app/api/admin/port-requests/route.ts": ["admin.port_request.updated"],
  };
  for (const [path, actions] of Object.entries(wired)) {
    const source = read(path);
    for (const action of actions) assert.ok(source.includes(action), `${path} records ${action}`);
  }
});

test("the audit trail is founder-only to read", () => {
  assert.match(read("src/app/api/admin/audit/route.ts"), /isPrivilegedRequest\(request\)/);
});
