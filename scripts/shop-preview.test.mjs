/*
 * The preview lets an owner hear their own shop before paying. It spends real
 * minutes and texts, and it runs on the shared demo line, so the limits and the
 * separation from real shops are what these pin down.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  buildPreviewAssistant,
  claimPreviewCall,
  createShopPreview,
  getPreviewStatus,
  PREVIEW_MAX_CALLS,
  PREVIEW_MAX_PER_PHONE,
  recordPreviewOutcome,
} from "../src/lib/shop-preview.ts";

const prisma = new PrismaClient();
const uniquePhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const callId = () => `preview-test-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const cleanup = (phone) => prisma.shopPreview.deleteMany({ where: { ownerPhoneNormalized: phone } });

test("one active preview per phone: resubmitting updates it instead of minting free calls", async () => {
  const phone = uniquePhone();
  try {
    const first = await createShopPreview({ shopName: "Cool Breeze Air", ownerPhone: phone });
    const second = await createShopPreview({ shopName: "Cool Breeze Air & Heat", ownerPhone: phone });
    assert.ok(first.ok && second.ok);
    assert.equal(second.token, first.token);
    assert.equal(second.reused, true);
    assert.equal(await prisma.shopPreview.count({ where: { ownerPhoneNormalized: phone } }), 1);
    assert.equal((await getPreviewStatus(first.token))?.shopName, "Cool Breeze Air & Heat");
  } finally {
    await cleanup(phone);
  }
});

test("a preview keeps the business type and starts with that industry's services", async () => {
  const phone = uniquePhone();
  try {
    const made = await createShopPreview({ shopName: "Bright Smile Dental", trade: "Dental office", ownerPhone: phone });
    assert.ok(made.ok);
    const row = await prisma.shopPreview.findFirst({ where: { ownerPhoneNormalized: phone } });
    assert.equal(row?.trade, "Dental office");
    assert.match(row?.servicesJson ?? "", /New patient/);
    const defaulted = await createShopPreview({ shopName: "Bright Smile", ownerPhone: uniquePhone() });
    assert.ok(defaulted.ok);
    const plain = await prisma.shopPreview.findUnique({ where: { token: defaulted.token } });
    assert.equal(plain?.trade, "HVAC", "a preview with no type answers as it always did");
    await prisma.shopPreview.delete({ where: { token: defaulted.token } });
  } finally {
    await cleanup(phone);
  }
});

test("rejects a phone that cannot be normalized", async () => {
  assert.deepEqual(await createShopPreview({ shopName: "X Air", ownerPhone: "12" }), { ok: false, reason: "invalid_phone" });
});

test("one phone gets a few fresh previews a month, not a free line forever", async () => {
  const phone = uniquePhone();
  try {
    const start = Date.now() - 10 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < PREVIEW_MAX_PER_PHONE; i += 1) {
      const made = await createShopPreview({ shopName: "Daily Air", ownerPhone: phone, now: new Date(start + i * 2 * 24 * 60 * 60 * 1000) });
      assert.ok(made.ok && !made.reused, `preview ${i + 1} is fresh because the last one expired`);
    }
    assert.deepEqual(await createShopPreview({ shopName: "Daily Air", ownerPhone: phone }), { ok: false, reason: "phone_cap" });
    const later = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    assert.ok((await createShopPreview({ shopName: "Daily Air", ownerPhone: phone, now: later })).ok, "the window rolls over");
  } finally {
    await cleanup(phone);
  }
});

test("a preview alert is never sent to a premium or offshore number", async () => {
  for (const phone of ["+19005550123", "+18765550123"]) {
    assert.deepEqual(await createShopPreview({ shopName: "Toll Air", ownerPhone: phone }), { ok: false, reason: "unsupported_destination" });
    assert.equal(await prisma.shopPreview.count({ where: { ownerPhoneNormalized: phone } }), 0);
  }
});

test("the preview route caps each network per day, not just per hour", () => {
  const route = readFileSync(new URL("../src/app/api/preview/route.ts", import.meta.url), "utf8");
  assert.match(route, /preview-day:\$\{ip\}/);
  assert.match(route, /phone_cap/);
});

test("the daily cap stops new previews", async () => {
  const phone = uniquePhone();
  const prev = process.env.PREVIEW_DAILY_CAP;
  process.env.PREVIEW_DAILY_CAP = "0";
  try {
    assert.deepEqual(await createShopPreview({ shopName: "Capped Air", ownerPhone: phone }), { ok: false, reason: "daily_cap" });
  } finally {
    if (prev === undefined) delete process.env.PREVIEW_DAILY_CAP;
    else process.env.PREVIEW_DAILY_CAP = prev;
    await cleanup(phone);
  }
});

test("claims are capped, atomic under a race, and idempotent per call id", async () => {
  const phone = uniquePhone();
  try {
    await createShopPreview({ shopName: "Race Air", ownerPhone: phone });
    const first = callId();
    const claimed = await claimPreviewCall({ callerPhone: phone, vapiCallId: first });
    assert.equal(claimed?.callsUsed, 1);
    const again = await claimPreviewCall({ callerPhone: phone, vapiCallId: first });
    assert.equal(again?.callsUsed, 1, "Vapi retrying the same assistant-request does not spend a second call");

    const racers = await Promise.all(
      Array.from({ length: 5 }, () => claimPreviewCall({ callerPhone: phone, vapiCallId: callId() })),
    );
    assert.equal(racers.filter(Boolean).length, PREVIEW_MAX_CALLS - 1, "only the remaining call is granted");
    const row = await prisma.shopPreview.findFirst({ where: { ownerPhoneNormalized: phone } });
    assert.equal(row?.callsUsed, PREVIEW_MAX_CALLS);
    assert.equal(await claimPreviewCall({ callerPhone: phone, vapiCallId: callId() }), null);
  } finally {
    await cleanup(phone);
  }
});

test("expired previews and unknown callers get no preview", async () => {
  const phone = uniquePhone();
  try {
    await createShopPreview({ shopName: "Old Air", ownerPhone: phone, now: new Date(Date.now() - 25 * 60 * 60 * 1000) });
    assert.equal(await claimPreviewCall({ callerPhone: phone, vapiCallId: callId() }), null);
    assert.equal(await claimPreviewCall({ callerPhone: uniquePhone(), vapiCallId: callId() }), null);
    assert.equal(await claimPreviewCall({ callerPhone: undefined, vapiCallId: callId() }), null);
  } finally {
    await cleanup(phone);
  }
});

test("the preview assistant speaks as the shop, cannot book, and is tagged as a preview", async () => {
  const phone = uniquePhone();
  try {
    await createShopPreview({ shopName: "Northside Comfort", serviceArea: "Plano and Frisco", ownerPhone: phone });
    const row = await claimPreviewCall({ callerPhone: phone, vapiCallId: callId() });
    const assistant = buildPreviewAssistant(row);
    assert.equal(assistant.metadata.orviusPreviewId, row.id);
    assert.match(assistant.firstMessage, /Northside Comfort/);
    const prompt = JSON.stringify(assistant.model);
    assert.match(prompt, /Plano and Frisco/);
    assert.match(prompt, /Never say a technician is booked/);
    const toolNames = JSON.stringify(assistant.model?.tools ?? []);
    assert.doesNotMatch(toolNames, /book_appointment|check_availability/i);
  } finally {
    await cleanup(phone);
  }
});

test("a preview call's outcome is stored once per call and never creates shop records", async () => {
  const phone = uniquePhone();
  const leadsBefore = await prisma.lead.count();
  const callsBefore = await prisma.call.count();
  try {
    const created = await createShopPreview({ shopName: "Outcome Air", ownerPhone: phone });
    const vapiCallId = callId();
    const row = await claimPreviewCall({ callerPhone: phone, vapiCallId });
    const message = {
      type: "end-of-call-report",
      call: { id: vapiCallId, customer: { number: phone } },
      summary: "Caller's AC is blowing warm air.",
      analysis: {
        structuredData: { name: "Dana Ortiz", serviceType: "AC repair", urgency: "urgent", address: "12 Elm St" },
      },
    };
    await recordPreviewOutcome(row, message);
    await recordPreviewOutcome(row, { ...message, summary: "a retry must not overwrite" });

    const status = await getPreviewStatus(created.token);
    assert.equal(status?.summary, "Caller's AC is blowing warm air.");
    assert.equal(status?.capture?.name, "Dana Ortiz");
    assert.equal(status?.capture?.address, "12 Elm St");
    assert.equal(await prisma.lead.count(), leadsBefore);
    assert.equal(await prisma.call.count(), callsBefore);
  } finally {
    await cleanup(phone);
  }
});

test("the Vapi webhook answers preview calls before it looks for a shop", () => {
  const source = readFileSync(new URL("../src/app/api/webhooks/vapi/route.ts", import.meta.url), "utf8");
  const post = source.slice(source.indexOf("export async function POST"));
  const assistantRequest = post.indexOf('type === "assistant-request"');
  const previewLookup = post.indexOf("findPreviewByVapiCallId(");
  const shopLookup = post.indexOf("findBusinessForCall(");
  assert.ok(assistantRequest > 0 && previewLookup > assistantRequest && shopLookup > previewLookup);
});

test.after(() => prisma.$disconnect());
