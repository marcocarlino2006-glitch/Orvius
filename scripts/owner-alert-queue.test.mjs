/*
 * The owner alert is the product.
 *
 * Everything upstream of it — answering, capturing, qualifying, booking — is
 * worthless if the shop owner never finds out a call came in. That path had no
 * test at all: `enqueueOwnerAlert` and `processNotificationQueue` were covered
 * only by a mirrored copy of their retry constants in trust-stack.test.mjs,
 * which asserted the ladder's numbers without ever running the ladder.
 *
 * These tests drive the real functions against the real database. Nothing is
 * module-mocked: an unconfigured Twilio client throws on its own, which is
 * exactly the failure the retry ladder exists for, and the email path goes out
 * through global fetch, which a test can stand in for honestly.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

import {
  MAX_ATTEMPTS,
  NOTIFICATION_RETRY_MINUTES,
  enqueueOwnerAlert,
  getNotificationRetryAt,
  processNotificationQueue,
} from "../src/lib/notification-queue.ts";

const prisma = new PrismaClient();

const OWNER_PHONE = "+15555550111";
const OWNER_EMAIL = "queue-proof@orvius.invalid";

async function makeShop(overrides = {}) {
  return prisma.business.create({
    data: {
      name: "Queue Proof HVAC",
      slug: `queue-proof-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      billingStatus: "pilot",
      ownerPhone: OWNER_PHONE,
      ownerEmail: OWNER_EMAIL,
      ...overrides,
    },
  });
}

const dropShop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

/* The queue drains oldest-first across every shop, so a limit sized only to
   this test's rows could be spent on unrelated fixtures before reaching them. */
async function drainAll() {
  const pending = await prisma.ownerNotification.count({
    where: { status: { in: ["pending", "sending"] } },
  });
  return processNotificationQueue(pending + 10);
}

function withEnv(vars, run) {
  const previous = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const restore = () => {
    for (const [k, v] of previous) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  return Promise.resolve()
    .then(run)
    .finally(restore);
}

test("an alert is queued once per configured channel", async () => {
  const shop = await makeShop();
  try {
    const result = await enqueueOwnerAlert({
      businessId: shop.id,
      dedupeKey: `enqueue:${shop.id}`,
      businessName: shop.name,
      message: "No cooling, same day",
      ownerPhone: shop.ownerPhone,
      ownerEmail: shop.ownerEmail,
    });

    assert.deepEqual(result.queued.sort(), ["email", "sms"]);
    assert.equal(result.duplicate, false);

    const rows = await prisma.ownerNotification.findMany({
      where: { businessId: shop.id },
    });
    assert.equal(rows.length, 2);
    assert.ok(
      rows.every((r) => r.status === "pending" && r.nextRetryAt !== null),
      "every row is left due immediately, not parked",
    );
  } finally {
    await dropShop(shop.id);
  }
});

test("the same call cannot alert the owner twice", async () => {
  const shop = await makeShop();
  try {
    const key = `dedupe:${shop.id}`;
    const common = {
      businessId: shop.id,
      dedupeKey: key,
      businessName: shop.name,
      message: "Water heater leaking",
      ownerPhone: shop.ownerPhone,
      ownerEmail: shop.ownerEmail,
    };

    await enqueueOwnerAlert(common);
    const second = await enqueueOwnerAlert(common);

    assert.deepEqual(second.queued, [], "a repeat webhook queues nothing");
    assert.equal(second.duplicate, true);
    assert.equal(await prisma.ownerNotification.count({ where: { businessId: shop.id } }), 2);
  } finally {
    await dropShop(shop.id);
  }
});

test("an owner who replied STOP still gets the email", async () => {
  const shop = await makeShop({ ownerSmsOptOutAt: new Date() });
  try {
    const result = await enqueueOwnerAlert({
      businessId: shop.id,
      dedupeKey: `optout:${shop.id}`,
      businessName: shop.name,
      message: "Furnace out",
      ownerPhone: shop.ownerPhone,
      ownerEmail: shop.ownerEmail,
    });

    assert.deepEqual(result.queued, ["email"], "SMS is suppressed, email is not");
    const rows = await prisma.ownerNotification.findMany({ where: { businessId: shop.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].channel, "email");
  } finally {
    await dropShop(shop.id);
  }
});

test("delivery stamps the call, so 'owner notified' means a message actually left", async () => {
  const shop = await makeShop({ ownerPhone: null });
  const realFetch = globalThis.fetch;
  try {
    const call = await prisma.call.create({
      data: { businessId: shop.id, vapiCallId: `queue-proof-${shop.id}`, status: "completed" },
    });
    const lead = await prisma.lead.create({
      data: { businessId: shop.id, callId: call.id, serviceType: "No heat", source: "call" },
    });

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ id: "resend-test-id" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await withEnv({ RESEND_API_KEY: "test-key" }, async () => {
      await enqueueOwnerAlert({
        businessId: shop.id,
        leadId: lead.id,
        dedupeKey: `deliver:${shop.id}`,
        businessName: shop.name,
        message: "No heat, same day",
        ownerEmail: shop.ownerEmail,
      });
      await drainAll();
    });

    const row = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id } });
    assert.equal(row.status, "sent");
    assert.equal(row.deliveryId, "resend-test-id");
    assert.ok(row.processedAt, "a delivered row is closed out");

    const stamped = await prisma.call.findUnique({ where: { id: call.id } });
    assert.ok(
      stamped.ownerNotifiedAt,
      "the call is only marked notified once the send succeeded",
    );
  } finally {
    globalThis.fetch = realFetch;
    await dropShop(shop.id);
  }
});

test("a failed send is retried on the published ladder, not dropped", async () => {
  const shop = await makeShop({ ownerEmail: null });
  try {
    /* No account SID or auth token, so the Twilio client throws when the queue
       reaches for it — the same shape as a real outage. */
    await withEnv(
      {
        ENABLE_OWNER_SMS: "true",
        TWILIO_PHONE_NUMBER: "+15555550100",
        TWILIO_ACCOUNT_SID: undefined,
        TWILIO_AUTH_TOKEN: undefined,
      },
      async () => {
        await enqueueOwnerAlert({
          businessId: shop.id,
          dedupeKey: `retry:${shop.id}`,
          businessName: shop.name,
          message: "Burst pipe",
          ownerPhone: shop.ownerPhone,
        });

        const before = Date.now();
        await drainAll();

        const row = await prisma.ownerNotification.findFirst({
          where: { businessId: shop.id, channel: "sms" },
        });
        assert.equal(row.status, "pending", "a failure stays queued");
        assert.equal(row.attempts, 1);
        assert.ok(row.error, "the reason is recorded on the row");
        assert.equal(row.processedAt, null, "not closed out while it still has attempts");

        const expected = getNotificationRetryAt(1, before).getTime();
        assert.ok(
          Math.abs(row.nextRetryAt.getTime() - expected) < 30_000,
          `next attempt is ${NOTIFICATION_RETRY_MINUTES[0]} minutes out, got ${row.nextRetryAt.toISOString()}`,
        );
        assert.equal(
          Math.round((expected - before) / 60_000),
          NOTIFICATION_RETRY_MINUTES[0],
          "the first failure takes the first rung, which it used to skip",
        );
      },
    );
  } finally {
    await dropShop(shop.id);
  }
});

test("a row that is not due yet is left alone", async () => {
  const shop = await makeShop({ ownerEmail: null });
  try {
    await enqueueOwnerAlert({
      businessId: shop.id,
      dedupeKey: `notdue:${shop.id}`,
      businessName: shop.name,
      message: "Later",
      ownerPhone: shop.ownerPhone,
    });
    await prisma.ownerNotification.updateMany({
      where: { businessId: shop.id },
      data: { nextRetryAt: new Date(Date.now() + 3_600_000) },
    });

    await drainAll();

    const row = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id } });
    assert.equal(row.attempts, 0, "the backoff is respected rather than burned through");
  } finally {
    await dropShop(shop.id);
  }
});

test("SMS that exhausts its attempts fails over to email rather than going quiet", async () => {
  const shop = await makeShop();
  try {
    await withEnv(
      {
        ENABLE_OWNER_SMS: "true",
        TWILIO_PHONE_NUMBER: "+15555550100",
        TWILIO_ACCOUNT_SID: undefined,
        TWILIO_AUTH_TOKEN: undefined,
        RESEND_API_KEY: "test-key",
      },
      async () => {
        const key = `exhaust:${shop.id}`;
        await enqueueOwnerAlert({
          businessId: shop.id,
          dedupeKey: key,
          businessName: shop.name,
          message: "Gas smell",
          ownerPhone: shop.ownerPhone,
          /* SMS only — the failover row is what should create the email. */
        });

        /* Walk every rung: fail, then pull the next attempt forward so the
           whole ladder runs without the test sleeping through four hours. */
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
          await drainAll();
          await prisma.ownerNotification.updateMany({
            where: { businessId: shop.id, status: "pending" },
            data: { nextRetryAt: new Date(Date.now() - 1000) },
          });
        }

        const sms = await prisma.ownerNotification.findFirst({
          where: { businessId: shop.id, dedupeKey: key, channel: "sms" },
        });
        assert.equal(sms.status, "failed", "the ladder ends, it does not loop forever");
        assert.equal(sms.attempts, MAX_ATTEMPTS);
        assert.equal(sms.nextRetryAt, null);

        const failover = await prisma.ownerNotification.findFirst({
          where: { businessId: shop.id, dedupeKey: `${key}:sms-failover`, channel: "email" },
        });
        assert.ok(
          failover,
          "an owner whose phone cannot be reached is still emailed",
        );
      },
    );
  } finally {
    await dropShop(shop.id);
  }
});

test("two drains running at once send one message, not two", async () => {
  const shop = await makeShop({ ownerPhone: null });
  const realFetch = globalThis.fetch;
  let sends = 0;
  try {
    globalThis.fetch = async () => {
      sends += 1;
      /* Hold the send open long enough that the second drain is guaranteed to
         reach the same row while the first still has it. */
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(JSON.stringify({ id: `resend-${sends}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await withEnv({ RESEND_API_KEY: "test-key" }, async () => {
      await enqueueOwnerAlert({
        businessId: shop.id,
        dedupeKey: `race:${shop.id}`,
        businessName: shop.name,
        message: "Two drains, one owner",
        ownerEmail: shop.ownerEmail,
      });

      await Promise.all([drainAll(), drainAll()]);
    });

    assert.equal(sends, 1, "the losing drain skipped the claimed row");
    const rows = await prisma.ownerNotification.findMany({ where: { businessId: shop.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "sent");
  } finally {
    globalThis.fetch = realFetch;
    await dropShop(shop.id);
  }
});

test("a claim left behind by a dead drain is taken back when its lease expires", async () => {
  const shop = await makeShop({ ownerPhone: null });
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ id: "resend-reclaimed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await withEnv({ RESEND_API_KEY: "test-key" }, async () => {
      await enqueueOwnerAlert({
        businessId: shop.id,
        dedupeKey: `lease:${shop.id}`,
        businessName: shop.name,
        message: "Stranded",
        ownerEmail: shop.ownerEmail,
      });

      /* What a process killed between claiming and sending leaves on disk. */
      await prisma.ownerNotification.updateMany({
        where: { businessId: shop.id },
        data: { status: "sending", nextRetryAt: new Date(Date.now() + 600_000) },
      });

      await drainAll();
      let row = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id } });
      assert.equal(row.status, "sending", "a live lease is respected");

      await prisma.ownerNotification.updateMany({
        where: { businessId: shop.id },
        data: { nextRetryAt: new Date(Date.now() - 1000) },
      });

      await drainAll();
      row = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id } });
      assert.equal(row.status, "sent", "the expired lease returned the row to the queue");
    });
  } finally {
    globalThis.fetch = realFetch;
    await dropShop(shop.id);
  }
});

test("the scheduled drain runs at least as often as the first retry rung", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const entry = config.crons?.find((c) => String(c.path).includes("cron/notifications"));
  assert.ok(entry, "the queue has a scheduled drain");

  /*
    This is the invariant that was silently false: the ladder retries after one
    minute, and the drain was scheduled daily, so a failed 2am alert waited
    until 09:00 UTC and five attempts would have taken five days.
  */
  const minuteField = String(entry.schedule).trim().split(/\s+/)[0];
  const everyMinutes =
    minuteField === "*"
      ? 1
      : Number(minuteField.match(/^\*\/(\d+)$/)?.[1] ?? NaN);
  assert.ok(
    Number.isFinite(everyMinutes),
    `schedule "${entry.schedule}" never runs sub-hourly`,
  );
  assert.ok(
    everyMinutes <= NOTIFICATION_RETRY_MINUTES[0],
    `drain runs every ${everyMinutes}m but the first retry is ${NOTIFICATION_RETRY_MINUTES[0]}m`,
  );
});

test.after(() => prisma.$disconnect());
