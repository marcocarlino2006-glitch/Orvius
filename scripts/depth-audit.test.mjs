#!/usr/bin/env node
/*
 * Fixes from the depth audit: the Monday email can be stopped in one click
 * (and providers can do it for the owner), lookups by customer, invoice and
 * text id are indexed, browsers' fixed icon paths resolve, and the hero
 * doesn't jump when the browser demo's status arrives.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.AUTH_SECRET ||= "test-secret-for-depth-audit";
process.env.RESEND_API_KEY = "re_test";
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "STRIPE_SECRET_KEY"]) delete process.env[key];

const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  if (String(input) !== "https://api.resend.com/emails") return realFetch(input, init);
  sent.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ id: `em_${sent.length}` }), { status: 200, headers: { "content-type": "application/json" } });
};

const { weeklyEmailToken, verifyWeeklyEmailToken, weeklyEmailUnsubscribe } = await import("../src/lib/weekly-email-optout.ts");
const { sendDueWeeklyReports } = await import("../src/lib/weekly-report.ts");
const route = await import("../src/app/api/public/unsubscribe/route.ts");

const prisma = new PrismaClient();
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

async function oldShop() {
  return prisma.business.create({
    data: {
      name: "Summit Heating",
      slug: `da-${stamp()}`,
      environment: "production",
      ownerEmail: `o-${stamp()}@example.test`,
      createdAt: new Date(Date.now() - 30 * 86_400_000),
      weeklyReportSentAt: new Date(0),
    },
  });
}

test("the unsubscribe token is signed per shop and can't be forged", () => {
  const token = weeklyEmailToken("shop_a");
  assert.equal(verifyWeeklyEmailToken(token), "shop_a");
  assert.equal(verifyWeeklyEmailToken(token.replace("shop_a", "shop_b")), null);
  assert.equal(verifyWeeklyEmailToken(`${token.slice(0, -1)}x`), null);
  assert.equal(verifyWeeklyEmailToken("nonsense"), null);
});

test("the Monday email carries a one-click unsubscribe, and stopping it holds", async () => {
  await prisma.business.updateMany({ where: { weeklyReportSentAt: new Date(0) }, data: { weeklyReportSentAt: new Date() } });
  const shop = await oldShop();
  await sendDueWeeklyReports(new Date(), 50);
  const mail = sent.find((m) => m.to.includes(shop.ownerEmail));
  assert.ok(mail, "the report went out");
  const links = weeklyEmailUnsubscribe(shop.id);
  assert.equal(mail.headers["List-Unsubscribe"], `<${links.oneClick}>`);
  assert.equal(mail.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(mail.text, /Stop these Monday emails: .*\/unsubscribe\?t=/);

  const oneClick = await route.POST(
    new Request(links.oneClick, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" }),
  );
  assert.equal(oneClick.status, 200);
  assert.ok((await prisma.business.findUnique({ where: { id: shop.id } })).weeklyEmailOffAt);
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "shop.weekly_email_off" } });
  assert.ok(audit);

  await prisma.business.update({ where: { id: shop.id }, data: { weeklyReportSentAt: new Date(0) } });
  const before = sent.length;
  await sendDueWeeklyReports(new Date(), 50);
  assert.equal(sent.slice(before).filter((m) => m.to.includes(shop.ownerEmail)).length, 0, "no email once stopped");

  const back = await route.POST(
    new Request(links.oneClick, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: true }) }),
  );
  assert.equal((await back.json()).on, true);
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).weeklyEmailOffAt, null);

  const forged = await route.POST(new Request("https://x.test/api/public/unsubscribe?t=abc.def", { method: "POST" }));
  assert.equal(forged.status, 400);
  await prisma.business.delete({ where: { id: shop.id } });
});

test("lookups by customer, invoice and text id use an index", async () => {
  for (const [table, col] of [["Call", "customerId"], ["Lead", "customerId"], ["Job", "customerId"], ["Payment", "invoiceId"], ["Message", "sid"], ["Deposit", "jobId"]]) {
    const [plan] = await prisma.$queryRawUnsafe(`EXPLAIN QUERY PLAN SELECT * FROM "${table}" WHERE "${col}" = 'x'`);
    assert.match(plan.detail, /USING INDEX/, `${table}.${col}`);
    assert.match(read("prisma/turso-migrate.sql"), new RegExp(`"${table}_${col}_idx"`));
  }
  assert.match(read("src/lib/customer.ts"), /take: TIMELINE_LIMIT/);
});

test("fixed icon paths resolve and the hero reserves the demo's space", () => {
  const config = read("next.config.ts");
  assert.match(config, /source: "\/favicon\.ico", destination: "\/icon"/);
  assert.match(config, /source: "\/apple-touch-icon\.png", destination: "\/apple-icon"/);
  const demo = read("src/components/talk-in-browser.tsx");
  assert.match(demo, /if \(view\.state === "hidden"\) return null;/);
  assert.match(demo, /disabled=\{checking\}/);
});

test("every published address is the inbox the founder reads", async () => {
  const { company } = await import("../src/lib/company.ts");
  for (const key of ["contactEmail", "supportEmail", "legalEmail", "securityEmail", "dmcaEmail"]) assert.equal(company[key], "support@orvius.im", key);
  const { execSync } = await import("node:child_process");
  const stale = execSync("git grep -l 'hello@orvius' -- src docs || true", { encoding: "utf8" }).trim();
  assert.equal(stale, "", "no page or email still points at hello@");
});

test.after(async () => {
  globalThis.fetch = realFetch;
  await prisma.$disconnect();
});
