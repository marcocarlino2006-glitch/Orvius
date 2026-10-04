import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { NextRequest } from "next/server";

import { issueMagicLink } from "../src/lib/magic-link.ts";
import {
  createPasswordAccount,
  dropUnverifiedPassword,
  hashPassword,
  setVerifiedPassword,
  verifyPasswordLogin,
} from "../src/lib/password-auth.ts";
import { prisma } from "../src/lib/prisma.ts";
import { PUT as redeemReset } from "../src/app/api/auth/password-reset/route.ts";

const DOMAIN = "password-auth-test.invalid";
const PASSWORD = "correct horse battery";
let counter = 0;
const address = (label) => `${label}-${Date.now()}-${counter++}@${DOMAIN}`;
const open = { publicSignupReady: true };

async function clear() {
  await prisma.passwordLogin.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.loginToken.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.membership.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.business.deleteMany({ where: { ownerEmail: { endsWith: DOMAIN } } });
  // Test IPs repeat across runs, and the reset limit is an hour long.
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "password-reset-" } } }).catch(() => {});
}

function shop(ownerEmail) {
  return prisma.business.create({
    data: { name: "Squat Test HVAC", slug: `pw-${Date.now()}-${counter++}`, ownerEmail },
  });
}

const savedEnv = {};
before(async () => {
  for (const key of ["ORVIUS_FOUNDER_EMAILS", "ORVIUS_AUTH_ALLOWED_EMAILS"]) savedEnv[key] = process.env[key];
  process.env.ORVIUS_FOUNDER_EMAILS = `founder@${DOMAIN}`;
  process.env.ORVIUS_AUTH_ALLOWED_EMAILS = `founder@${DOMAIN},support@${DOMAIN}`;
  await clear();
});
after(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await clear();
  await prisma.$disconnect();
});

test("signing up lets the owner straight in with that password, and only that password", async () => {
  const email = address("new");
  assert.deepEqual(await createPasswordAccount(email.toUpperCase(), PASSWORD, open), { ok: true, email });
  assert.equal(await verifyPasswordLogin(email, PASSWORD), email);
  assert.equal(await verifyPasswordLogin(email, "wrong password"), null);
  assert.equal(await verifyPasswordLogin(address("nobody"), PASSWORD), null);

  const row = await prisma.passwordLogin.findUnique({ where: { email } });
  assert.ok(!row.passwordHash.includes(PASSWORD), "the password itself is never stored");
  assert.notEqual(await hashPassword(PASSWORD), await hashPassword(PASSWORD), "salted");
});

test("a second signup for the same email does not replace the first password", async () => {
  const email = address("dup");
  await createPasswordAccount(email, PASSWORD, open);
  const again = await createPasswordAccount(email, "attacker password", open);
  assert.equal(again.ok, false);
  assert.equal(again.reason, "exists");
  assert.equal(await verifyPasswordLogin(email, "attacker password"), null);
  assert.equal(await verifyPasswordLogin(email, PASSWORD), email);
});

test("short passwords, bad emails and closed signup are refused", async () => {
  assert.equal((await createPasswordAccount(address("short"), "1234567", open)).reason, "weak-password");
  assert.equal((await createPasswordAccount("not-an-email", PASSWORD, open)).reason, "invalid-email");
  const closed = await createPasswordAccount(address("closed"), PASSWORD, { publicSignupReady: false });
  assert.equal(closed.reason, "closed");
});

test("nobody can sign up with the email of an existing shop, the founder or support", async () => {
  const owner = address("owner");
  await shop(owner);
  assert.equal((await createPasswordAccount(owner, PASSWORD, open)).reason, "claimed");
  assert.equal((await createPasswordAccount(`founder@${DOMAIN}`, PASSWORD, open)).reason, "claimed");
  assert.equal((await createPasswordAccount(`support@${DOMAIN}`, PASSWORD, open)).reason, "claimed");
  assert.equal(await prisma.passwordLogin.count({ where: { email: owner } }), 0);
});

test("an unproven password keeps the shop it created but cannot pick up an invite sent to that email", async () => {
  const email = address("squat");
  await createPasswordAccount(email, PASSWORD, open);
  await shop(email);
  assert.equal(await verifyPasswordLogin(email, PASSWORD), email, "its own new shop is fine");

  const other = await shop(address("other-owner"));
  await prisma.membership.create({ data: { businessId: other.id, email, role: "dispatcher" } });
  assert.equal(await verifyPasswordLogin(email, PASSWORD), null, "the invite belongs to whoever owns the inbox");
});

test("proving the email another way drops an unproven password, and keeps a proven one", async () => {
  const squatted = address("drop");
  await createPasswordAccount(squatted, PASSWORD, open);
  await dropUnverifiedPassword(squatted);
  assert.equal(await verifyPasswordLogin(squatted, PASSWORD), null);

  const proven = address("keep");
  await setVerifiedPassword(proven, PASSWORD);
  await dropUnverifiedPassword(proven);
  assert.equal(await verifyPasswordLogin(proven, PASSWORD), proven);
});

test("ten wrong guesses lock the login, even against the right password", async () => {
  const email = address("lock");
  await createPasswordAccount(email, PASSWORD, open);
  for (let i = 0; i < 10; i++) assert.equal(await verifyPasswordLogin(email, `guess ${i}`), null);
  assert.equal(await verifyPasswordLogin(email, PASSWORD), null);

  await prisma.passwordLogin.update({ where: { email }, data: { lockedUntil: new Date(Date.now() - 1000) } });
  assert.equal(await verifyPasswordLogin(email, PASSWORD), email, "the lock expires");
});

function resetRequest(body) {
  return new NextRequest("http://localhost/api/auth/password-reset", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.${counter++ % 250}.1` },
    body: JSON.stringify(body),
  });
}

test("a reset link sets a proven password once; the link cannot be reused", async () => {
  const email = address("reset");
  await createPasswordAccount(email, PASSWORD, open);
  const allowed = process.env.ORVIUS_AUTH_ALLOWED_EMAILS;
  process.env.ORVIUS_AUTH_ALLOWED_EMAILS = `${allowed},${email}`;
  const issued = await issueMagicLink(email);
  assert.equal(issued.ok, true);

  const res = await redeemReset(resetRequest({ token: issued.token, password: "a brand new one" }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).email, email);
  assert.equal(await verifyPasswordLogin(email, "a brand new one"), email);
  assert.equal(await verifyPasswordLogin(email, PASSWORD), null);
  assert.ok((await prisma.passwordLogin.findUnique({ where: { email } })).verifiedAt);

  const replay = await redeemReset(resetRequest({ token: issued.token, password: "attacker again" }));
  assert.equal(replay.status, 400);
  assert.equal(await verifyPasswordLogin(email, "attacker again"), null);
});

test("a reset without a valid link changes nothing", async () => {
  const res = await redeemReset(resetRequest({ token: "made-up", password: "whatever12" }));
  assert.equal(res.status, 400);
});
