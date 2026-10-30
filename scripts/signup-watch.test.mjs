#!/usr/bin/env node
/*
 * Signup closes when one launch setting drops, and the site still looks fine:
 * the pay button quietly becomes "book a call". Production checks every
 * five-minute drain and tells the founder which setting is off.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.RESEND_API_KEY = "re_test_key";
delete process.env.RESEND_FROM;
process.env.ORVIUS_FOUNDER_EMAILS = "founder@orvius.test";
delete process.env.ORVIUS_FOUNDER_PHONE;

const { prisma } = await import("../src/lib/prisma.ts");
const { pageIfSignupClosed } = await import("../src/lib/signup-watch.ts");

const all = {
  selfServeEnabled: true,
  authReady: true,
  billingReady: true,
  telephonyReady: true,
  lineProvisioningReady: true,
  voiceWebhookReady: true,
  emailReady: true,
  legalReady: true,
};

test("closed signup in production pages the founder with what is off, once per six hours", async () => {
  const realFetch = globalThis.fetch;
  const realEnv = process.env.VERCEL_ENV;
  const emails = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://api.resend.com")) {
      emails.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "e" }), { status: 200 });
    }
    return realFetch(url, init);
  };
  const clean = () => prisma.cronRun.deleteMany({ where: { name: "page:signup_closed" } });
  await clean();
  const now = new Date("2031-09-10T14:00:00Z");
  const closed = { ready: false, requirements: { ...all, selfServeEnabled: false, billingReady: false } };
  try {
    delete process.env.VERCEL_ENV;
    assert.deepEqual(await pageIfSignupClosed(now, closed), { checked: false }, "previews and local never page");

    process.env.VERCEL_ENV = "production";
    assert.deepEqual(await pageIfSignupClosed(now, { ready: true, requirements: all }), { checked: true, open: true });
    assert.equal(emails.length, 0);

    const first = await pageIfSignupClosed(now, closed);
    assert.deepEqual(first.missing, ["selfServeEnabled", "billingReady"]);
    assert.equal(first.paged, true);
    assert.equal(emails.length, 1);
    assert.match(emails[0].text, /Self-serve signup is closed in production/);
    assert.match(emails[0].text, /Off: selfServeEnabled, billingReady\./);

    assert.equal((await pageIfSignupClosed(new Date(now.getTime() + 60 * 60_000), closed)).paged, false, "an hour later: still the same problem");
    assert.equal((await pageIfSignupClosed(new Date(now.getTime() + 6 * 60 * 60_000), closed)).paged, true, "six hours later it reminds");
    assert.equal(emails.length, 2);
  } finally {
    globalThis.fetch = realFetch;
    if (realEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = realEnv;
    await clean();
  }
});

test("the five-minute drain runs the signup check", () => {
  assert.match(readFileSync("src/app/api/cron/alert-drain/route.ts", "utf8"), /pageIfSignupClosed\(\)/);
});

test.after(() => prisma.$disconnect());
