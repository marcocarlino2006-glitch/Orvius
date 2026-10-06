#!/usr/bin/env node
/*
 * The unified inbox: every customer text in and out lands on one thread per
 * phone, calls sit in that thread, and while the owner is texting someone
 * their replies go to the owner instead of opening a lead with an auto-reply.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const {
  OWNER_CONVERSATION_WINDOW_MS,
  getThread,
  hasActiveOwnerConversation,
  listThreads,
  markThreadRead,
  recordMessage,
  applyMessageReceipt,
  inboundMediaFromForm,
} = await import("../src/lib/messages.ts");
const { sendCustomerSms } = await import("../src/lib/customer-sms.ts");
const { POST } = await import("../src/app/api/webhooks/twilio/sms/route.ts");
const { NextRequest } = await import("next/server");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

async function shop() {
  return prisma.business.create({
    data: {
      name: "Bright Smile Dental",
      slug: `msg-${stamp()}`,
      trade: "Dental",
      hoursJson: "{}",
      servicesJson: "[]",
      timezone: "America/Chicago",
      vapiPhoneNumber: randomPhone(),
      ownerPhone: randomPhone(),
      ownerEmail: `owner-${stamp()}@example.test`,
    },
  });
}

const text = (business, From, Body, MessageSid = `SM${stamp()}`) =>
  POST(
    new NextRequest("http://localhost/api/webhooks/twilio/sms", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From, To: business.vapiPhoneNumber, Body, MessageSid }),
    }),
  );

test("a new text lands on the thread with Orvius's reply, once even if redelivered", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const sid = `SM${stamp()}`;
    const res = await text(business, phone, "Can I get a cleaning next week?", sid);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Thanks for contacting us/);
    await text(business, phone, "Can I get a cleaning next week?", sid);

    const messages = await prisma.message.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(
      messages.map((m) => [m.direction, m.author]),
      [
        ["in", "customer"],
        ["out", "orvius"],
      ],
      "the redelivered text is not a second message",
    );
    assert.equal(messages[0].body, "Can I get a cleaning next week?");
    assert.equal(messages[0].readAt, null, "a customer text starts unread");
    assert.equal(await prisma.lead.count({ where: { businessId: business.id } }), 1);
  } finally {
    await drop(business.id);
  }
});

test("a reply to the owner's text goes to the owner, not to a new lead or auto-reply", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    await recordMessage({
      businessId: business.id,
      phone,
      direction: "out",
      author: "owner",
      body: "Hi Ann, we have 3pm Thursday open. Want it?",
      sid: `SM${stamp()}`,
    });
    assert.equal(await hasActiveOwnerConversation(business.id, phone), true);

    const res = await text(business, phone, "Perfect, 3pm works for me");
    assert.equal(await res.text(), "<Response></Response>", "Orvius stays quiet");
    assert.equal(await prisma.lead.count({ where: { businessId: business.id } }), 0);

    const inbound = await prisma.message.findFirst({ where: { businessId: business.id, direction: "in" } });
    assert.equal(inbound?.body, "Perfect, 3pm works for me");
    const alert = await prisma.ownerNotification.findFirst({ where: { businessId: business.id } });
    assert.ok(alert, "the owner is told");
    assert.match(alert.message ?? "", /Perfect, 3pm works for me/);
  } finally {
    await drop(business.id);
  }
});

test("after a week of owner silence a text is a new lead again", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    await recordMessage({
      businessId: business.id,
      phone,
      direction: "out",
      author: "owner",
      body: "See you Thursday",
      at: new Date(Date.now() - OWNER_CONVERSATION_WINDOW_MS - 60_000),
    });
    assert.equal(await hasActiveOwnerConversation(business.id, phone), false);
    await recordMessage({ businessId: business.id, phone, direction: "out", author: "orvius", body: "Reminder: tomorrow 3pm" });
    assert.equal(await hasActiveOwnerConversation(business.id, phone), false, "Orvius's own texts don't claim the thread");

    const res = await text(business, phone, "My crown fell out");
    assert.match(await res.text(), /Thanks for contacting us/);
    assert.equal(await prisma.lead.count({ where: { businessId: business.id } }), 1);
  } finally {
    await drop(business.id);
  }
});

test("threads: one per phone, newest first, unread counts, calls inline, search", async () => {
  const business = await shop();
  try {
    const ann = randomPhone();
    const bob = randomPhone();
    const t0 = Date.now() - 60 * 60_000;
    const at = (min) => new Date(t0 + min * 60_000);
    const customer = await prisma.customer.create({
      data: { businessId: business.id, name: "Ann Cole", phone: ann, phoneNormalized: ann },
    });
    await recordMessage({ businessId: business.id, phone: ann, direction: "in", author: "customer", body: "Is Friday open?", at: at(1) });
    await prisma.call.create({
      data: { businessId: business.id, customerId: customer.id, callerPhone: ann, status: "ended", durationSec: 95, summary: "Asked about Friday", createdAt: at(2) },
    });
    await recordMessage({ businessId: business.id, phone: ann, direction: "out", author: "owner", body: "Friday 10am works", at: at(3) });
    await recordMessage({ businessId: business.id, phone: ann, direction: "in", author: "customer", body: "Booked, thanks", at: at(4) });
    await recordMessage({ businessId: business.id, phone: bob, direction: "in", author: "customer", body: "Do you take Delta Dental?", at: at(5) });
    await recordMessage({ businessId: business.id, phone: bob, direction: "in", author: "customer", body: "Hello?", at: at(6) });

    const threads = await listThreads(business.id);
    assert.deepEqual(threads.map((t) => t.phone), [bob, ann], "newest conversation first");
    assert.equal(threads[0].unread, 2);
    assert.equal(threads[0].lastBody, "Hello?");
    assert.equal(threads[1].name, "Ann Cole");
    assert.equal(threads[1].unread, 2);

    assert.deepEqual((await listThreads(business.id, { query: "ann" })).map((t) => t.phone), [ann]);
    assert.deepEqual((await listThreads(business.id, { query: bob.slice(-4) })).map((t) => t.phone), [bob]);

    const thread = await getThread(business.id, ann);
    assert.deepEqual(
      thread.entries.map((e) => (e.kind === "call" ? "call" : `${e.direction}:${e.author}`)),
      ["in:customer", "call", "out:owner", "in:customer"],
      "texts and calls in the order they happened",
    );
    assert.equal(thread.customer?.id, customer.id);

    assert.equal(await markThreadRead(business.id, ann), 2);
    assert.equal((await listThreads(business.id)).find((t) => t.phone === ann).unread, 0);

    const other = await shop();
    try {
      assert.deepEqual(await listThreads(other.id), [], "one shop never sees another's texts");
      assert.deepEqual((await getThread(other.id, ann)).entries, []);
    } finally {
      await drop(other.id);
    }
  } finally {
    await drop(business.id);
  }
});

test("STOP shows on the thread and blocks the owner's next text", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const res = await text(business, phone, "STOP");
    assert.equal(res.status, 200);
    const thread = await getThread(business.id, phone);
    assert.equal(thread.optedOut, true);
    assert.equal(thread.entries[0].body, "STOP");
    assert.equal((await listThreads(business.id))[0].optedOut, true);

    const sent = await sendCustomerSms({ businessId: business.id, to: phone, body: "Are you sure?", author: "owner" });
    assert.deepEqual(sent, { sent: false, reason: "customer_opted_out" });
    assert.equal(
      await prisma.message.count({ where: { businessId: business.id, author: "owner" } }),
      0,
      "a blocked text is not shown as sent",
    );
  } finally {
    await drop(business.id);
  }
});

test("a text that never left is never shown as sent", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const sent = await sendCustomerSms({ businessId: business.id, to: phone, body: "Running 10 min late", author: "owner" });
    assert.deepEqual(sent, { sent: false, reason: "sms_not_configured" });
    assert.equal(await prisma.message.count({ where: { businessId: business.id } }), 0);
  } finally {
    await drop(business.id);
  }
});

test("the owner's own number texting the line is not a customer thread", async () => {
  const business = await shop();
  try {
    await text(business, business.ownerPhone, "testing the line");
    assert.equal(await prisma.message.count({ where: { businessId: business.id } }), 0);
  } finally {
    await drop(business.id);
  }
});

test("carrier receipts move a sent text forward, never back", async () => {
  const business = await shop();
  try {
    const phone = randomPhone();
    const sid = `SM${stamp()}`;
    await recordMessage({ businessId: business.id, phone, direction: "out", author: "owner", body: "On our way", sid });
    assert.equal(await applyMessageReceipt({ messageSid: sid, messageStatus: "sent" }), 1);
    assert.equal(await applyMessageReceipt({ messageSid: sid, messageStatus: "delivered" }), 1);
    assert.equal(await applyMessageReceipt({ messageSid: sid, messageStatus: "sent" }), 0, "a late 'sent' doesn't undo 'delivered'");
    assert.equal(await applyMessageReceipt({ messageSid: sid, messageStatus: "bogus" }), 0);
    let entry = (await getThread(business.id, phone)).entries[0];
    assert.equal(entry.deliveryStatus, "delivered");

    const bad = `SM${stamp()}`;
    await recordMessage({ businessId: business.id, phone, direction: "out", author: "owner", body: "Running late", sid: bad });
    await applyMessageReceipt({ messageSid: bad, messageStatus: "undelivered" });
    entry = (await getThread(business.id, phone)).entries.find((e) => e.body === "Running late");
    assert.equal(entry.deliveryStatus, "undelivered");
  } finally {
    await drop(business.id);
  }
});

test("a photo-only text still reaches the shop, with the photos on the thread", async () => {
  const business = await shop();
  try {
    const from = randomPhone();
    const photo = "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1";
    const res = await POST(
      new NextRequest("http://localhost/api/webhooks/twilio/sms", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          From: from,
          To: business.vapiPhoneNumber,
          Body: "",
          MessageSid: `SM${stamp()}`,
          NumMedia: "3",
          MediaUrl0: photo,
          MediaContentType0: "image/jpeg",
          MediaUrl1: "https://evil.example/x.jpg",
          MediaContentType1: "image/jpeg",
          MediaUrl2: "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME3",
          MediaContentType2: "text/vcard",
        }),
      }),
    );
    assert.equal(res.status, 200);
    const lead = await prisma.lead.findFirst({ where: { businessId: business.id, phone: from } });
    assert.ok(lead, "a photo with no words still opens a lead");
    assert.match(lead.notes, /1 photo in Inbox/);
    const thread = await getThread(business.id, from);
    const inbound = thread.entries.find((e) => e.kind === "text" && e.direction === "in");
    assert.equal(inbound.photos, 1, "only the Twilio-hosted image is kept");
    assert.equal(inbound.body, "Sent a photo");
  } finally {
    await drop(business.id);
  }
});

test("media parsing caps photos and rejects lookalike hosts", () => {
  const form = { NumMedia: "8" };
  for (let i = 0; i < 8; i += 1) {
    form[`MediaUrl${i}`] = `https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME${i}`;
    form[`MediaContentType${i}`] = "image/png";
  }
  assert.equal(inboundMediaFromForm(form).length, 5);
  assert.deepEqual(
    inboundMediaFromForm({ NumMedia: "1", MediaUrl0: "https://api.twilio.com.evil.example/2010-04-01/Accounts/x", MediaContentType0: "image/png" }),
    [],
  );
});

test.after(() => prisma.$disconnect());
