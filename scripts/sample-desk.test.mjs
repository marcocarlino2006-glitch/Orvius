/**
 * The sample desk is the default until someone signs up.
 * A signed-out visitor can read the day. They cannot read billing, export, or account.
 * A signed-in person with no shop is not handed the sample.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { isSampleDeskPage, isSampleDeskRead } = await import("../src/lib/sample-desk.ts");
const { findPublicSampleShop } = await import("../src/lib/sample-shop.ts");

const tenant = readFileSync(new URL("../src/lib/tenant.ts", import.meta.url), "utf8");
const middleware = readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8");
const ring1 = readFileSync(new URL("../src/app/api/ring1/route.ts", import.meta.url), "utf8");

test("the desk pages are open and setup stays behind sign-in", () => {
  assert.equal(isSampleDeskPage("/dashboard"), true);
  assert.equal(isSampleDeskPage("/dashboard/work"), true);
  assert.equal(isSampleDeskPage("/dashboard/jobs/abc"), true);
  assert.equal(isSampleDeskPage("/dashboard/customers/abc"), true);
  assert.equal(isSampleDeskPage("/dashboard/inbox/abc"), true);
  assert.equal(isSampleDeskPage("/dashboard/jobs/new"), false);
  assert.equal(isSampleDeskPage("/dashboard/onboarding"), false);
  assert.equal(isSampleDeskPage("/dashboard/billing"), false);
  assert.equal(isSampleDeskPage("/dashboard/reports"), false);
  assert.equal(isSampleDeskPage("/dashboard/ask"), false);
  assert.equal(isSampleDeskPage("/dashboard/settings"), false);
  assert.equal(isSampleDeskPage("/admin"), false);
  assert.equal(isSampleDeskPage("/admin/daily"), false);
});

test("only the day reads are public", () => {
  for (const path of [
    "/api/ring1",
    "/api/work",
    "/api/calls",
    "/api/calls/abc",
    "/api/customers",
    "/api/customers/abc",
    "/api/customers/abc/visits",
    "/api/jobs",
    "/api/jobs/abc",
    "/api/jobs/abc/field",
    "/api/leads",
    "/api/leads/abc",
    "/api/dispatch",
    "/api/technicians",
    "/api/messages",
    "/api/messages/thread",
  ]) {
    assert.equal(isSampleDeskRead(path), true, path);
  }
  for (const path of [
    "/api/account",
    "/api/account/export",
    "/api/account/area",
    "/api/customers/abc/export",
    "/api/customers/win-back",
    "/api/jobs/abc/billing",
    "/api/jobs/abc/notes",
    "/api/jobs/abc/photos",
    "/api/jobs/abc/confirm-sms",
    "/api/reports",
    "/api/connect",
    "/api/onboarding",
    "/api/ask",
    "/api/copilot",
    "/api/billing/checkout",
    "/api/leads/abc/follow-up",
  ]) {
    assert.equal(isSampleDeskRead(path), false, path);
  }
});

test("sign-in still owns a shop, and a visitor cannot aim a private read at the sample", () => {
  const sessionGate = tenant.slice(tenant.indexOf("export async function requireBusinessSession"));
  const sample = sessionGate.indexOf("sampleDeskAccess()");
  const noShop = sessionGate.indexOf("noBusinessResponse()");
  assert.ok(sample > sessionGate.indexOf("if (!email"), "the sample answers only when nobody is signed in");
  assert.ok(noShop > sample, "a signed-up person with no shop is not handed the sample");
  assert.match(tenant, /isSampleDeskRead\(path\)/);
  assert.match(middleware, /isSampleDeskPage\(pathname\)/);
  assert.match(middleware, /x-orvius-pathname/);
  assert.match(middleware, /forwarded\.set\("x-orvius-pathname", pathname\)/);
  assert.match(tenant, /Sign in to do that on your shop/);
  assert.match(ring1, /guest \? null : business\.ownerPhone/);
  assert.match(ring1, /if \(!locked && !guest\)/);
});

test("the public sample is the reference shop, never some other business", async () => {
  const prisma = new PrismaClient();
  const slug = `not-the-sample-${Date.now().toString(36)}`;
  try {
    await prisma.business.create({
      data: {
        name: "Summit Heating & Air",
        slug,
        environment: "production",
        trade: "HVAC",
        ownerEmail: "not-the-sample@example.com",
      },
    });
    const sample = await findPublicSampleShop();
    assert.ok(sample, "the reference shop is on this database");
    assert.ok(sample.slug === "summit-hvac-demo" || sample.slug === "summit-hvac");
    assert.notEqual(sample.slug, slug);
    assert.notEqual(sample.ownerEmail, "not-the-sample@example.com");
  } finally {
    await prisma.business.deleteMany({ where: { slug } });
    await prisma.$disconnect();
  }
});
