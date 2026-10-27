/**
 * A visitor can open the sample day. They cannot read a shop.
 * Two shops do not share a number or a customer.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { isSampleDeskPage, isSampleDeskRead } = await import("../src/lib/sample-desk.ts");
const { SAMPLE_ROWS, sampleDeskPreview } = await import("../src/lib/sample-preview.ts");

const tenant = readFileSync(new URL("../src/lib/tenant.ts", import.meta.url), "utf8");
const middleware = readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8");
const preview = readFileSync(new URL("../src/lib/sample-preview.ts", import.meta.url), "utf8");
const provider = readFileSync(new URL("../src/lib/ring1-context.tsx", import.meta.url), "utf8");
const customers = readFileSync(new URL("../src/app/api/customers/route.ts", import.meta.url), "utf8");
const setup = readFileSync(new URL("../src/lib/setup-sandbox.ts", import.meta.url), "utf8");

test("only the home sample is open, and a shop's pages stay signed in", () => {
  assert.equal(isSampleDeskPage("/dashboard"), true);
  for (const path of [
    "/dashboard/work",
    "/dashboard/jobs/abc",
    "/dashboard/customers/abc",
    "/dashboard/inbox/abc",
    "/dashboard/calls",
    "/dashboard/schedule",
    "/dashboard/jobs/new",
    "/dashboard/onboarding",
    "/dashboard/billing",
    "/dashboard/reports",
    "/dashboard/ask",
    "/dashboard/settings",
    "/admin",
  ]) {
    assert.equal(isSampleDeskPage(path), false, path);
  }
});

test("a shop's number and records are never a public read", () => {
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
    "/api/leads",
    "/api/leads/abc",
    "/api/dispatch",
    "/api/technicians",
    "/api/messages",
    "/api/account",
    "/api/account/export",
  ]) {
    assert.equal(isSampleDeskRead(path), false, path);
  }
});

test("sign-in resolves one shop, and the sample is not that shop's database", () => {
  const sessionGate = tenant.slice(tenant.indexOf("export async function requireBusinessSession"));
  assert.equal(sessionGate.includes("sampleDeskAccess"), false);
  assert.equal(sessionGate.includes("findPublicSampleShop"), false);
  assert.ok(sessionGate.indexOf("noBusinessResponse()") > sessionGate.indexOf("if (!email"));
  assert.match(tenant, /Sign in to do that on your shop/);
  assert.match(middleware, /isSampleDeskPage\(pathname\)/);
  assert.equal(preview.includes("prisma"), false);
  assert.equal(preview.includes("+1347"), false);
  assert.equal(preview.includes("844"), false);
  for (const row of SAMPLE_ROWS) assert.match(row.phone, /555/);
  const shown = sampleDeskPreview();
  assert.equal(shown.business.guest, true);
  assert.equal(shown.business.line, null);
  assert.equal(shown.business.ownerPhone, null);
  assert.match(provider, /status === "unauthenticated"/);
  assert.match(provider, /sampleDeskPreview\(\)/);
  assert.match(customers, /businessId: business\.id/);
  const created = setup.slice(setup.indexOf("prisma.business.create"), setup.indexOf("await recordAudit"));
  assert.match(created, /environment:\s*"test"/);
  assert.equal(created.includes("twilioPhone"), false);
  assert.equal(created.includes("vapiPhoneNumber"), false);
  assert.equal(created.includes("Nora Walsh"), false);
});

test("one shop's customer and number are not the other shop's", async () => {
  const prisma = new PrismaClient();
  const stamp = Date.now().toString(36);
  const slugA = `own-shop-a-${stamp}`;
  const slugB = `own-shop-b-${stamp}`;
  const lineA = `+1555555${stamp.slice(-4).padStart(4, "0")}`.slice(0, 12);
  try {
    const shopA = await prisma.business.create({
      data: {
        name: "Shop A",
        slug: slugA,
        environment: "production",
        trade: "HVAC",
        ownerEmail: `a-${stamp}@example.com`,
        twilioPhone: lineA,
        vapiPhoneNumber: lineA,
      },
    });
    const shopB = await prisma.business.create({
      data: {
        name: "Shop B",
        slug: slugB,
        environment: "production",
        trade: "HVAC",
        ownerEmail: `b-${stamp}@example.com`,
      },
    });
    await prisma.customer.create({
      data: {
        businessId: shopA.id,
        name: "Only on A",
        phone: "+1 555 010 0199",
        phoneNormalized: `15550100199${stamp}`.slice(0, 16),
      },
    });
    const onB = await prisma.customer.findMany({ where: { businessId: shopB.id } });
    assert.equal(onB.length, 0);
    assert.equal(shopB.twilioPhone, null);
    assert.equal(shopB.vapiPhoneNumber, null);
    assert.notEqual(shopA.twilioPhone, shopB.twilioPhone);
    assert.notEqual(shopA.vapiPhoneNumber, shopB.vapiPhoneNumber);
  } finally {
    await prisma.business.deleteMany({ where: { slug: { in: [slugA, slugB] } } });
    await prisma.$disconnect();
  }
});
