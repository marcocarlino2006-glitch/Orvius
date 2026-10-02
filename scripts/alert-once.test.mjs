#!/usr/bin/env node
/*
 * A drain that died between Twilio accepting the owner's text and the row
 * saying "sent" must not text the owner again: the next drain finds the
 * message in Twilio's log and records it instead.
 */
import assert from "node:assert/strict";
import test from "node:test";

const { findAlreadySentSms } = await import("../src/lib/notification-queue.ts");

const since = new Date("2026-10-02T14:00:00Z");
const at = (min) => new Date(since.getTime() + min * 60_000);

function fakeTwilio(messages) {
  const calls = [];
  return {
    calls,
    messages: {
      list: async (params) => {
        calls.push(params);
        return messages;
      },
    },
  };
}

test("an accepted text with the same body since the claim counts as sent", async () => {
  const client = fakeTwilio([
    { sid: "SMold", body: "New lead: Ann", direction: "outbound-api", dateCreated: at(-30), status: "delivered" },
    { sid: "SMother", body: "Different alert", direction: "outbound-api", dateCreated: at(1), status: "sent" },
    { sid: "SMhit", body: "New lead: Ann", direction: "outbound-api", dateCreated: at(2), status: "queued" },
  ]);
  const sid = await findAlreadySentSms(client, { to: "+13125550147", body: "New lead: Ann", since });
  assert.equal(sid, "SMhit");
  assert.equal(client.calls[0].to, "+13125550147");
});

test("nothing matching, a failed send, or an inbound reply means send it", async () => {
  const client = fakeTwilio([
    { sid: "SMfail", body: "New lead: Ann", direction: "outbound-api", dateCreated: at(1), status: "failed" },
    { sid: "SMin", body: "New lead: Ann", direction: "inbound", dateCreated: at(1), status: "received" },
    { sid: "SMold", body: "New lead: Ann", direction: "outbound-api", dateCreated: at(-30), status: "delivered" },
  ]);
  assert.equal(await findAlreadySentSms(client, { to: "+13125550147", body: "New lead: Ann", since }), null);
});
