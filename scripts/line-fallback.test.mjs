#!/usr/bin/env node
/*
 * The Vapi-outage net is proven by reading Twilio back, not by trusting that it
 * was set once. These cover the read-back and the repair.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.APP_URL = "https://app.example.test";
const { auditLineFallback, unprotectedLines, expectedVoiceFallbackUrl } = await import("../src/lib/line-fallback.ts");

const EXPECTED = expectedVoiceFallbackUrl();

function fakeTwilio(numbers) {
  const updates = [];
  const client = (sid) => ({
    update: async (params) => {
      updates.push({ sid, ...params });
      const row = numbers.find((n) => n.sid === sid);
      row.voiceFallbackUrl = params.voiceFallbackUrl;
    },
  });
  client.list = async ({ phoneNumber }) => numbers.filter((n) => n.phoneNumber === phoneNumber);
  return { updates, client: { incomingPhoneNumbers: Object.assign(client, { list: client.list }) } };
}

const line = (n, over = {}) => ({ sid: `PN${n}`, phoneNumber: `+1555000${n}`, voiceUrl: "https://api.vapi.ai/twilio/inbound_call", voiceFallbackUrl: EXPECTED, ...over });

test("a line is protected only when Twilio holds our fallback URL", async () => {
  const { client, updates } = fakeTwilio([
    line(1),
    line(2, { voiceFallbackUrl: "" }),
    line(3, { voiceFallbackUrl: "https://elsewhere.example/voice" }),
    line(4, { voiceFallbackUrl: null, voiceUrl: "" }),
  ]);
  const rows = await auditLineFallback(["+15550001", "+15550002", "+15550003", "+15550004", "+15550009"], client);
  assert.deepEqual(
    rows.map((r) => [r.phone, r.status]),
    [
      ["+15550001", "ok"],
      ["+15550002", "missing"],
      ["+15550003", "wrong"],
      ["+15550004", "missing"],
      ["+15550009", "not_on_account"],
    ],
  );
  assert.equal(rows[0].aiRoute, "vapi");
  assert.equal(rows[3].aiRoute, "none");
  assert.deepEqual(unprotectedLines(rows).map((r) => r.phone), ["+15550002", "+15550003", "+15550004"]);
  assert.equal(updates.length, 0, "a plain audit changes nothing");
});

test("fix sets only the fallback, and a second audit finds nothing left", async () => {
  const { client, updates } = fakeTwilio([line(1), line(2, { voiceFallbackUrl: "" })]);
  const fixed = await auditLineFallback(["+15550001", "+15550002"], client, { fix: true });
  assert.deepEqual(fixed.map((r) => r.status), ["ok", "fixed"]);
  assert.deepEqual(updates, [{ sid: "PN2", voiceFallbackUrl: EXPECTED, voiceFallbackMethod: "POST" }]);
  const again = await auditLineFallback(["+15550001", "+15550002"], client);
  assert.deepEqual(unprotectedLines(again), []);
});

test("a number listed twice is checked once", async () => {
  const { client } = fakeTwilio([line(1)]);
  assert.equal((await auditLineFallback(["+15550001", "+15550001"], client)).length, 1);
});

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the founder can check and fix lines from /admin, and nobody else can", () => {
  const route = read("src/app/api/admin/line-fallback/route.ts");
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  const post = route.slice(route.indexOf("export async function POST"));
  for (const handler of [get, post]) {
    assert.ok(handler.indexOf("isPrivilegedRequest") < handler.indexOf("respond("), "auth runs before any Twilio call");
  }
  assert.match(get, /respond\(false\)/, "GET never changes Twilio");
  assert.match(post, /respond\(true\)/);
  assert.match(read("src/app/admin/page.tsx"), /<LineFallbackCard \/>/);
});
