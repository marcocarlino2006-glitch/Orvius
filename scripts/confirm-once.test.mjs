/*
 * A customer gets one confirmation text per job however many autopilot runs
 * overlap (docs/BACKLOG.md S8): a send in flight holds the job, automatic
 * sends skip a job already texted, and only the owner's resend repeats one.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) {
  delete process.env[key];
}
const { sendCustomerConfirmSms } = await import("../src/lib/customer-confirm.ts");

const prisma = new PrismaClient();
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

async function withJob(extra, run) {
  const shop = await prisma.business.create({
    data: { name: "Once Air", slug: `once-${stamp()}`, environment: "test", timezone: "America/Chicago" },
  });
  try {
    const customer = await prisma.customer.create({ data: { businessId: shop.id, phone: "+15125550177", phoneNormalized: "+15125550177", name: "Pat" } });
    const job = await prisma.job.create({
      data: {
        businessId: shop.id,
        customerId: customer.id,
        title: "AC repair",
        status: "scheduled",
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        ...extra,
      },
    });
    await run(job);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
}
const claimOf = async (id) => (await prisma.job.findUniqueOrThrow({ where: { id } })).customerConfirmClaimAt;

test("a send already in flight holds the job, so an overlapping run sends nothing", async () => {
  const held = new Date();
  await withJob({ customerConfirmClaimAt: held }, async (job) => {
    assert.deepEqual(await sendCustomerConfirmSms(job.id, { firstOnly: true }), { sent: false, reason: "already_sending_or_sent" });
    assert.deepEqual(await sendCustomerConfirmSms(job.id), { sent: false, reason: "already_sending_or_sent" });
    assert.equal((await claimOf(job.id)).getTime(), held.getTime(), "the other run's claim is left alone");
  });
});

test("automatic sends skip a job whose confirmation already went out", async () => {
  await withJob({ customerConfirmSentAt: new Date(Date.now() - 60_000) }, async (job) => {
    assert.deepEqual(await sendCustomerConfirmSms(job.id, { firstOnly: true }), { sent: false, reason: "already_sending_or_sent" });
    assert.equal(await claimOf(job.id), null);
  });
});

test("a send that died frees the job after two minutes, and a failed send lets go at once", async () => {
  await withJob({ customerConfirmClaimAt: new Date(Date.now() - 3 * 60_000) }, async (job) => {
    const result = await sendCustomerConfirmSms(job.id, { firstOnly: true });
    assert.equal(result.reason, "sms_not_configured", "the stale claim was taken over and the send attempted");
    assert.equal(await claimOf(job.id), null, "a send that didn't go out releases its claim");
  });
});

test("every automatic sender asks for first-only; the owner's resend does not", () => {
  assert.match(read("src/lib/autopilot.ts"), /sendCustomerConfirmSms\(job\.id, \{ firstOnly: true \}\)/);
  assert.match(read("src/lib/job.ts"), /sendCustomerConfirmSms\(bookedJobId, \{ firstOnly: true \}\)/);
  assert.match(read("src/app/api/jobs/[id]/confirm-sms/route.ts"), /sendCustomerConfirmSms\(id\)/);
});

test.after(() => prisma.$disconnect());
