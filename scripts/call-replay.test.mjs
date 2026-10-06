/*
 * Call Replay: a preview call the owner chooses to share, frozen as a public
 * page with numbers and emails hidden. Only preview calls can be shared.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"]) delete process.env[key];

const { isReplayable, maskForShare, replayTurns } = await import("../src/lib/call-replay-copy.ts");
const { getReplay, shareReplay } = await import("../src/lib/call-replay.ts");
const { claimPreviewCall, createShopPreview, getPreviewStatus, recordPreviewOutcome } = await import("../src/lib/shop-preview.ts");

const prisma = new PrismaClient();
const phone = () => `+1555${2_000_000 + Math.floor(Math.random() * 8e6)}`;

test("turns come from Vapi's messages, merged per speaker, with the transcript as fallback", () => {
  const turns = replayTurns({
    messages: [
      { role: "system", message: "You are…" },
      { role: "bot", message: "Thank you for calling Ray's.", secondsFromStart: 0.4 },
      { role: "user", message: "My AC quit.", secondsFromStart: 3 },
      { role: "user", message: "It's 95 in here.", secondsFromStart: 4 },
      { role: "tool_calls", message: "" },
      { role: "bot", message: "I'm sorry. What's the address?", secondsFromStart: 6 },
    ],
  });
  assert.deepEqual(
    turns.map((t) => [t.who, t.text]),
    [
      ["ai", "Thank you for calling Ray's."],
      ["caller", "My AC quit. It's 95 in here."],
      ["ai", "I'm sorry. What's the address?"],
    ],
  );
  assert.equal(turns[1].at, 3);
  const fromText = replayTurns({ transcript: "AI: Hello\nUser: Hi there\nAI: How can I help?" });
  assert.equal(fromText.length, 3);
  assert.equal(isReplayable(fromText), true);
  assert.equal(isReplayable(fromText.slice(0, 1)), false, "a greeting alone is not a call");
});

test("phone numbers and emails never reach the public page; short numbers stay", () => {
  assert.equal(maskForShare("Call me at (512) 555-0134 tomorrow"), "Call me at ••• tomorrow");
  assert.equal(maskForShare("it's 5 1 2 5 5 5 0 1 3 4"), "it's •••");
  assert.equal(maskForShare("email ray@raysheating.com ok"), "email ••• ok");
  assert.equal(maskForShare("It's 95 degrees at 1420 Oak St"), "It's 95 degrees at 1420 Oak St");
});

test("an owner shares a preview call; the link is a frozen copy", async () => {
  const ownerPhone = phone();
  const created = await createShopPreview({ shopName: "Ray's Heating", trade: "HVAC", ownerPhone });
  assert.equal(created.ok, true);
  assert.equal((await shareReplay(created.token)).reason, "no_call", "nothing to share before a call");

  const callId = `call-${Date.now()}`;
  const preview = await claimPreviewCall({ callerPhone: ownerPhone, vapiCallId: callId });
  await recordPreviewOutcome(preview, {
    type: "end-of-call-report",
    call: { id: callId, customer: { number: ownerPhone } },
    analysis: { structuredData: { name: "Dana Ortiz", serviceType: "AC repair", urgency: "Urgent" } },
    artifact: {
      messages: [
        { role: "bot", message: "Thank you for calling Ray's Heating. How can I help?" },
        { role: "user", message: "My AC stopped. Call me back at 512 555 0134." },
        { role: "bot", message: "Got it. Ray will text you to confirm a time." },
      ],
    },
  });
  assert.equal((await getPreviewStatus(created.token)).replayable, true);

  const shared = await shareReplay(created.token);
  assert.equal(shared.ok, true);
  assert.equal((await shareReplay(created.token)).id, shared.id, "sharing the same call twice gives one link");

  const replay = await getReplay(shared.id, { countView: true });
  assert.equal(replay.shopName, "Ray's Heating");
  assert.equal(replay.turns.length, 3);
  assert.ok(!JSON.stringify(replay).includes("0134"), "the caller's number is hidden");
  assert.deepEqual(replay.capture, { serviceType: "AC repair", urgency: "Urgent", firstName: "Dana" });

  await claimPreviewCall({ callerPhone: ownerPhone, vapiCallId: `${callId}-2` });
  const after = await getReplay(shared.id);
  assert.equal(after.turns.length, 3, "a later preview call does not change a posted link");
  assert.equal(await getReplay("../../etc"), null);
});

test("the replay is wired into the preview and the public page", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.match(read("src/components/shop-preview-form.tsx"), /Share this call/);
  assert.match(read("src/components/call-replay-player.tsx"), /utm_source=replay/);
  assert.match(read("src/app/p/[id]/page.tsx"), /getReplay\(id, \{ countView: true \}\)/);
});
