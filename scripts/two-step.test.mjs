#!/usr/bin/env node
/*
 * Password change and two-step sign-in. The codes follow RFC 6238, a seen code
 * can't be replayed, a recovery code works once, a password or email link
 * alone stops working when two-step is on, and the email link isn't spent
 * by asking for the code.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

process.env.AUTH_SECRET ||= "test-auth-secret-for-two-step-0123456789";
process.env.ORVIUS_PUBLIC_SIGNUP ||= "1";

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const { base32Decode, base32Encode, currentStep, matchTotp, totpAt, startTwoStep, confirmTwoStep, verifyTwoStepCode, twoStepStatus } =
  await import("../src/lib/two-step.ts");
const { requireTwoStepCode } = await import("../src/lib/two-step-signin.ts");
const { consumeMagicLink, peekMagicLink } = await import("../src/lib/magic-link.ts");
const { createPasswordAccount, verifyPasswordLogin } = await import("../src/lib/password-auth.ts");
const { prisma } = await import("../src/lib/prisma.ts");
const { createHash, randomBytes } = await import("node:crypto");

const emails = [];
const newEmail = () => {
  const e = `two-step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  emails.push(e);
  return e;
};
/* Pinned to the step at load: the server accepts one step of drift, so a test that crosses a 30s boundary still sees the code it means. */
const BASE_STEP = currentStep();
const codeFor = (setupKey, offsetSteps = 0) => totpAt(base32Decode(setupKey.replace(/\s/g, "")), BASE_STEP + offsetSteps);

test.after(async () => {
  await prisma.twoStep.deleteMany({ where: { email: { in: emails } } });
  await prisma.passwordLogin.deleteMany({ where: { email: { in: emails } } });
  await prisma.loginToken.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

test("codes match the RFC 6238 reference values", () => {
  const secret = Buffer.from("12345678901234567890");
  assert.equal(totpAt(secret, Math.floor(59 / 30)), "287082");
  assert.equal(totpAt(secret, Math.floor(1111111109 / 30)), "081804");
  assert.equal(totpAt(secret, Math.floor(1234567890 / 30)), "005924");
  assert.equal(matchTotp(secret, "287082", 59_000), 1);
  assert.equal(matchTotp(secret, "287 082", 59_000), 1, "spaces are fine");
  assert.equal(matchTotp(secret, "287082", 59_000 + 120_000), null, "a code four steps old is refused");
  assert.equal(matchTotp(secret, "abc", 59_000), null);
});

test("base32 keys round-trip, so any authenticator reads them", () => {
  const raw = randomBytes(20);
  assert.deepEqual(base32Decode(base32Encode(raw)), raw);
  assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
});

test("turning on: nothing is enforced until the app proves it works", async () => {
  const email = newEmail();
  const started = await startTwoStep(email);
  assert.ok(started.ok);
  assert.match(started.qr, /^data:image\/svg\+xml;base64,/);
  assert.match(started.uri, /^otpauth:\/\/totp\/Orvius%3A/);
  assert.equal((await twoStepStatus(email)).enabled, false);
  await requireTwoStepCode(email, undefined);

  const wrong = await confirmTwoStep(email, "000000");
  assert.equal(wrong.ok, false);
  const row = await prisma.twoStep.findUnique({ where: { email } });
  assert.doesNotMatch(row.secretSealed, new RegExp(started.setupKey.replace(/\s/g, "")), "the secret is sealed at rest");

  const confirmed = await confirmTwoStep(email, codeFor(started.setupKey));
  assert.ok(confirmed.ok);
  assert.equal(confirmed.recoveryCodes.length, 10);
  const status = await twoStepStatus(email);
  assert.equal(status.enabled, true);
  assert.equal(status.recoveryLeft, 10);
});

test("a code works once, and each recovery code works once", async () => {
  const email = newEmail();
  const started = await startTwoStep(email);
  const { recoveryCodes } = await confirmTwoStep(email, codeFor(started.setupKey));
  assert.equal((await verifyTwoStepCode(email, codeFor(started.setupKey))).ok, false, "the confirm code can't be replayed");
  const next = codeFor(started.setupKey, 1);
  assert.deepEqual(await verifyTwoStepCode(email, next), { ok: true, via: "app" });
  assert.equal((await verifyTwoStepCode(email, next)).ok, false);

  assert.deepEqual(await verifyTwoStepCode(email, recoveryCodes[0].toLowerCase()), { ok: true, via: "recovery" });
  assert.equal((await verifyTwoStepCode(email, recoveryCodes[0])).ok, false);
  assert.equal((await twoStepStatus(email)).recoveryLeft, 9);
});

test("with two-step on, a correct password alone is not enough", async () => {
  const email = newEmail();
  await createPasswordAccount(email, "correct horse 1", { publicSignupReady: true });
  assert.equal(await verifyPasswordLogin(email, "correct horse 1"), email);
  const started = await startTwoStep(email);
  await confirmTwoStep(email, codeFor(started.setupKey));

  await assert.rejects(requireTwoStepCode(email, ""), (err) => err.code === "two_step_required");
  await assert.rejects(requireTwoStepCode(email, "123456"), (err) => err.code === "two_step_invalid");
  await requireTwoStepCode(email, codeFor(started.setupKey, 1));
});

test("asking for the code doesn't spend the email link", async () => {
  const email = newEmail();
  const token = randomBytes(32).toString("base64url");
  await prisma.loginToken.create({
    data: { email, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 600_000) },
  });
  const started = await startTwoStep(email);
  await confirmTwoStep(email, codeFor(started.setupKey));

  assert.equal(await peekMagicLink(token), email);
  await assert.rejects(requireTwoStepCode(email, undefined), (err) => err.code === "two_step_required");
  assert.equal(await peekMagicLink(token), email, "still valid after the code prompt");
  assert.equal(await consumeMagicLink(token), email);
  assert.equal(await peekMagicLink(token), null, "spent once used");
});

function post(body) {
  return new Request("http://localhost/api/account/security", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("changing a password needs the current one and never marks the address proven", async () => {
  const { GET, POST } = await import("../src/app/api/account/security/route.ts");
  const email = newEmail();
  await createPasswordAccount(email, "first password", { publicSignupReady: true });
  signedInAs = email;
  try {
    assert.deepEqual((await (await GET()).json()).password, { set: true });
    const wrong = await POST(post({ action: "password", current: "nope nope", next: "second password" }));
    assert.equal(wrong.status, 400);
    assert.match((await wrong.json()).error, /current password didn't match/);
    assert.equal((await POST(post({ action: "password", current: "first password", next: "short" }))).status, 400);
    const ok = await POST(post({ action: "password", current: "first password", next: "second password" }));
    assert.equal(ok.status, 200);
    assert.equal(await verifyPasswordLogin(email, "second password"), email);
    assert.equal(await verifyPasswordLogin(email, "first password"), null);
    assert.equal((await prisma.passwordLogin.findUnique({ where: { email } })).verifiedAt, null);
  } finally {
    signedInAs = null;
  }
});

test("a Google or email-link user can add a password, and two-step runs end to end", async () => {
  const { POST } = await import("../src/app/api/account/security/route.ts");
  const email = newEmail();
  signedInAs = email;
  try {
    const set = await POST(post({ action: "password", next: "brand new pass" }));
    assert.equal(set.status, 200);
    assert.ok((await prisma.passwordLogin.findUnique({ where: { email } })).verifiedAt, "this session already proved the address");

    const started = await (await POST(post({ action: "two_step_start" }))).json();
    const on = await (await POST(post({ action: "two_step_confirm", code: codeFor(started.setupKey) }))).json();
    assert.equal(on.twoStep.enabled, true);
    assert.equal(on.recoveryCodes.length, 10);
    assert.equal((await POST(post({ action: "two_step_start" }))).status, 409, "can't restart while on");

    const badOff = await POST(post({ action: "two_step_disable", code: "000000" }));
    assert.equal(badOff.status, 400);
    const fresh = await (await POST(post({ action: "recovery_codes", code: codeFor(started.setupKey, 1) }))).json();
    assert.equal(fresh.recoveryCodes.length, 10);
    assert.equal((await verifyTwoStepCode(email, on.recoveryCodes[0])).ok, false, "old recovery codes stop working");

    const off = await (await POST(post({ action: "two_step_disable", code: fresh.recoveryCodes[0] }))).json();
    assert.equal(off.twoStep.enabled, false);
    await requireTwoStepCode(email, undefined);
  } finally {
    signedInAs = null;
  }
});

test("signed out, the security API refuses", async () => {
  const { GET, POST } = await import("../src/app/api/account/security/route.ts");
  assert.equal((await GET()).status, 401);
  assert.equal((await POST(post({ action: "two_step_start" }))).status, 401);
});
