#!/usr/bin/env node
/*
 * Changing the sign-in email: the person proves who they are, the new inbox
 * proves it is theirs, the old inbox hears about both steps, and every record
 * keyed by the old address moves together so nobody is locked out of a shop.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "STRIPE_SECRET_KEY"]) delete process.env[key];
process.env.RESEND_API_KEY = "re_test";

const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  if (String(input) !== "https://api.resend.com/emails") return realFetch(input, init);
  sent.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ id: `em_${sent.length}` }), { status: 200, headers: { "content-type": "application/json" } });
};

const { requestEmailChange, confirmEmailChange, peekEmailChange } = await import("../src/lib/email-change.ts");
const { sessionRevoked } = await import("../src/lib/account-security.ts");
const { hashPassword } = await import("../src/lib/password-auth.ts");
const { hasAnyShopAccess } = await import("../src/lib/workspace-access.ts");

const prisma = new PrismaClient();
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const to = (address) => sent.filter((m) => [m.to].flat().includes(address));

async function owner() {
  const email = `own-${stamp()}@example.test`;
  const business = await prisma.business.create({
    data: { name: "Summit Heating", slug: `ec-${stamp()}`, environment: "test", ownerEmail: email },
  });
  return { email, business };
}

test("a confirmed change moves the shop, password, assignments and devices, and signs the old address out", async () => {
  const { email, business } = await owner();
  const next = `new-${stamp()}@example.test`;
  await prisma.passwordLogin.create({ data: { email, passwordHash: await hashPassword("correct horse 1"), verifiedAt: new Date() } });
  const lead = await prisma.lead.create({ data: { businessId: business.id, name: "Dana", phone: "+15550001111", assigneeEmail: email } });
  await prisma.signInEvent.create({ data: { email, method: "password", device: "Chrome on Mac" } });

  assert.equal((await requestEmailChange({ fromEmail: email, toEmail: next, password: "wrong" })).ok, false, "needs the current password");
  const requested = await requestEmailChange({ fromEmail: email, toEmail: next.toUpperCase(), password: "correct horse 1" });
  assert.equal(requested.ok, true);
  assert.equal(to(next).length, 1, "the new inbox gets the link");
  assert.match(to(next)[0].text, /\/account\/email\?token=/);
  assert.match(to(email).at(-1).text, new RegExp(`New address: ${next}`), "the old inbox is told");
  assert.equal((await prisma.business.findUnique({ where: { id: business.id } })).ownerEmail, email, "nothing moves before the link");
  assert.deepEqual(await peekEmailChange(requested.token), { fromEmail: email, toEmail: next });

  const signedInAt = Date.now() - 1000;
  const done = await confirmEmailChange(requested.token);
  assert.equal(done.ok, true);
  assert.equal((await prisma.business.findUnique({ where: { id: business.id } })).ownerEmail, next);
  assert.equal(await hasAnyShopAccess(next), true);
  assert.equal(await hasAnyShopAccess(email), false);
  const login = await prisma.passwordLogin.findUnique({ where: { email: next } });
  assert.ok(login?.verifiedAt, "the password moves and the new address counts as proven");
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).assigneeEmail, next);
  assert.equal(await prisma.signInEvent.count({ where: { email: next } }), 1);
  assert.equal(await sessionRevoked(email, signedInAt), true, "old sessions end");
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "account.email_changed" } });
  assert.equal(audit?.actorEmail, next);
  assert.match(to(email).at(-1).subject, /Sign-in email changed/);

  assert.equal((await confirmEmailChange(requested.token)).ok, false, "a link works once");
  await prisma.lead.delete({ where: { id: lead.id } });
  await prisma.business.delete({ where: { id: business.id } });
  await prisma.passwordLogin.deleteMany({ where: { email: next } });
});

test("an address that already signs in, or an expired link, moves nothing", async () => {
  const a = await owner();
  const b = await owner();
  const taken = await requestEmailChange({ fromEmail: a.email, toEmail: b.email });
  assert.equal(taken.ok, false);
  assert.equal(taken.status, 409);

  const next = `late-${stamp()}@example.test`;
  const requested = await requestEmailChange({ fromEmail: a.email, toEmail: next });
  assert.equal(requested.ok, true);
  const later = new Date(Date.now() + 61 * 60_000);
  assert.equal(await peekEmailChange(requested.token, later), null);
  assert.equal((await confirmEmailChange(requested.token, later)).ok, false);

  const again = await requestEmailChange({ fromEmail: a.email, toEmail: `other-${stamp()}@example.test` });
  assert.equal((await confirmEmailChange(requested.token)).ok, false, "a newer request kills the older link");
  await prisma.business.update({ where: { id: b.business.id }, data: { ownerEmail: `x-${stamp()}@example.test` } });
  assert.equal((await confirmEmailChange(again.token)).ok, true);

  for (const s of [a, b]) await prisma.business.delete({ where: { id: s.business.id } });
});

test("an unproven password someone set up for the new address is dropped, never inherited", async () => {
  const { email, business } = await owner();
  const next = `squat-${stamp()}@example.test`;
  await prisma.passwordLogin.create({ data: { email: next, passwordHash: await hashPassword("attacker pass 1") } });
  const requested = await requestEmailChange({ fromEmail: email, toEmail: next });
  assert.equal(requested.ok, true, "an unverified password doesn't count as a sign-in");
  assert.equal((await confirmEmailChange(requested.token)).ok, true);
  assert.equal(await prisma.passwordLogin.count({ where: { email: next } }), 0);
  await prisma.business.delete({ where: { id: business.id } });
});

test("the change asks for two-step when it's on, is limited, and is wired into settings", async () => {
  const { email, business } = await owner();
  await prisma.twoStep.create({ data: { email, secretSealed: "x", enabledAt: new Date() } });
  const needCode = await requestEmailChange({ fromEmail: email, toEmail: `n-${stamp()}@example.test`, code: "000000" });
  assert.equal(needCode.ok, false);
  assert.match(needCode.error, /code/);
  await prisma.twoStep.delete({ where: { email } });

  for (let i = 0; i < 3; i += 1) assert.equal((await requestEmailChange({ fromEmail: email, toEmail: `r${i}-${stamp()}@example.test` })).ok, true);
  assert.equal((await requestEmailChange({ fromEmail: email, toEmail: `r4-${stamp()}@example.test` })).status, 429);

  assert.match(read("src/app/api/account/security/route.ts"), /email_change/);
  assert.match(read("src/components/settings-center/security-group.tsx"), /Change email/);
  assert.match(read("src/components/email-change-confirm.tsx"), /onClick/, "confirming takes a tap, so a mail scanner can't");
  assert.match(read("prisma/turso-migrate.sql"), /CREATE TABLE IF NOT EXISTS "EmailChange"/);
  await prisma.emailChange.deleteMany({ where: { fromEmail: email } });
  await prisma.business.delete({ where: { id: business.id } });
});

test.after(async () => {
  globalThis.fetch = realFetch;
  await prisma.$disconnect();
});
