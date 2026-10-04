/*
 * Two synthetic shops with different lines, assistants, timezones and owners.
 * Each inbound path must land on its own shop's rules, records and recipient,
 * and a number no shop owns must resolve to nobody rather than a neighbour.
 * The HTTP half (A attacking B's ids, exports, Ask, settings) is
 * scripts/tenant-probe.mjs, which needs a running server.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const baseUrl =
  process.env.DATABASE_URL ??
  readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (baseUrl?.startsWith("file:") && !baseUrl.includes("socket_timeout")) {
  process.env.DATABASE_URL = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}connection_limit=1&socket_timeout=60`;
}
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY"]) delete process.env[key];

const { ingestEndOfCallReport } = await import("../src/lib/call-ingest.ts");
const { resolveBusinessByInboundPhone, resolveBusinessForInboundSms } = await import("../src/lib/resolve-shop-line.ts");
const { resolveShopAccess } = await import("../src/lib/workspace-access.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 8);

async function twoShops() {
  const tag = uid();
  const make = (label, line, timezone, ownerPhone) =>
    prisma.business.create({
      data: {
        name: `Route ${label} ${tag}`,
        slug: `route-${label}-${tag}`,
        environment: "test",
        trade: "HVAC",
        timezone,
        ownerPhone,
        ownerEmail: `route-${label}-${tag}@example.test`,
        twilioPhone: line,
        vapiPhoneNumber: line,
        vapiAssistantId: `asst-${label}-${tag}`,
        billingStatus: "active",
        billingPlan: "pro",
      },
    });
  const a = await make("a", `+1555001${tag.length}01`.slice(0, 12), "America/New_York", "+15550005551");
  const b = await make("b", `+1555001${tag.length}02`.slice(0, 12), "America/Los_Angeles", "+15550005552");
  for (const shop of [a, b]) {
    await prisma.technician.create({ data: { businessId: shop.id, name: `Tech ${shop.name}`, skillsJson: "[]" } });
  }
  return { a, b };
}
const drop = (...ids) => prisma.business.deleteMany({ where: { id: { in: ids } } });

function report(id, phone) {
  return {
    type: "end-of-call-report",
    call: { id, customer: { number: phone } },
    summary: "AC out",
    transcript: "User: AC not cooling",
    durationSeconds: 90,
    analysis: {
      structuredData: { name: "Same Caller", phone, serviceType: "AC not cooling", urgency: "same-day", address: "5 Elm St, Austin TX 78701" },
    },
  };
}

test("each line resolves to its own shop; an unknown line resolves to nobody", async () => {
  const { a, b } = await twoShops();
  try {
    assert.equal((await resolveBusinessByInboundPhone(a.twilioPhone))?.id, a.id);
    assert.equal((await resolveBusinessByInboundPhone(b.twilioPhone))?.id, b.id);
    assert.equal(await resolveBusinessByInboundPhone("+15550000000"), null);
    assert.equal((await resolveBusinessForInboundSms({ to: b.twilioPhone, from: "+15125550999" }))?.id, b.id);
    assert.equal(await resolveBusinessForInboundSms({ to: "+15550000000", from: "+15125550999" }), null);
  } finally {
    await drop(a.id, b.id);
  }
});

test("the same caller in both shops gets each shop's timezone, technician, records and owner", async () => {
  const { a, b } = await twoShops();
  try {
    const caller = "+15125550333";
    const ra = await ingestEndOfCallReport({ business: a, vapiCallId: `ra-${uid()}`, message: report(`ra-${uid()}`, caller) });
    const rb = await ingestEndOfCallReport({ business: b, vapiCallId: `rb-${uid()}`, message: report(`rb-${uid()}`, caller) });

    const [ja, jb] = await Promise.all([
      prisma.job.findUniqueOrThrow({ where: { id: ra.jobId }, include: { technician: true, customer: true } }),
      prisma.job.findUniqueOrThrow({ where: { id: rb.jobId }, include: { technician: true, customer: true } }),
    ]);
    assert.equal(ja.businessId, a.id);
    assert.equal(jb.businessId, b.id);
    assert.equal(ja.technician.businessId, a.id);
    assert.equal(jb.technician.businessId, b.id);
    assert.notEqual(ja.customerId, jb.customerId);

    const [na, nb] = await Promise.all([
      prisma.ownerNotification.findFirstOrThrow({ where: { leadId: ra.leadId, channel: "sms" } }),
      prisma.ownerNotification.findFirstOrThrow({ where: { leadId: rb.leadId, channel: "sms" } }),
    ]);
    assert.equal(na.ownerPhone, a.ownerPhone);
    assert.equal(nb.ownerPhone, b.ownerPhone);
    assert.match(na.message, /E[DS]T/, "A's alert is in A's timezone");
    assert.match(nb.message, /P[DS]T/, "B's alert is in B's timezone");
  } finally {
    await drop(a.id, b.id);
  }
});

test("an invited dispatcher opens the shop they were added to, and never another", async () => {
  const { a, b } = await twoShops();
  try {
    const email = `disp-${uid()}@example.test`;
    await prisma.membership.create({ data: { businessId: a.id, email, role: "dispatcher" } });
    const access = await resolveShopAccess(email, null);
    assert.equal(access?.business.id, a.id);
    assert.equal(access?.role, "dispatcher");
    assert.equal((await resolveShopAccess(email, b.id))?.business.id, a.id, "a cookie naming B cannot open B");
  } finally {
    await drop(a.id, b.id);
  }
});

test("setup status comes from the open workspace, not only shops the user owns", () => {
  const route = readFileSync(new URL("../src/app/api/onboarding/route.ts", import.meta.url), "utf8");
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(get, /resolveShopAccess\(email\)/);
  assert.doesNotMatch(get, /findBusinessForOwner/);
});

test.after(() => prisma.$disconnect());
