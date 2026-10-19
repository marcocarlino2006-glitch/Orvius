import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { describeTestAlert } = await import("../src/lib/test-alert-message.ts");
const { searchSettings, sectionFromAnchor } = await import("../src/lib/settings-center.ts");

const to = { phone: "+1 312 555 0100", email: "owner@shop.test" };

test("a test alert says sent, not delivered, and only for the channels a provider accepted", () => {
  assert.deepEqual(describeTestAlert({ sms: { status: "sent" }, email: { status: "sent" } }, to), {
    ok: true,
    partial: false,
    message: "Sent a text to +1 312 555 0100 and an email to owner@shop.test. If it hasn't arrived in a minute, check the number and your spam folder.",
  });
  assert.match(describeTestAlert({ sms: { status: "sent" } }, to).message, /^Sent a text to \+1 312 555 0100\. If it hasn't arrived/);
  for (const out of [describeTestAlert({ sms: { status: "sent" }, email: { status: "sent" } }, to), describeTestAlert({ email: { status: "sent" } }, to)]) {
    assert.doesNotMatch(out.message, /deliver|Texted|Emailed/, "provider acceptance is never reported as delivery");
  }
});

test("a failed text with a delivered email is reported as a problem, not a success", () => {
  const out = describeTestAlert({ sms: { status: "failed", error: "unreachable" }, email: { status: "sent" } }, to);
  assert.equal(out.ok, true);
  assert.equal(out.partial, true);
  assert.match(out.message, /didn't go through \(unreachable\)\. Check your mobile number/);
});

test("texting switched off on Orvius's side is named, not blamed on a missing mobile", () => {
  const out = describeTestAlert({ email: { status: "sent" } }, to);
  assert.equal(out.partial, true);
  assert.match(out.message, /text alerts are off right now/);
  assert.match(describeTestAlert({ email: { status: "sent" } }, { phone: null, email: to.email }).message, /Add your mobile/);
});

test("nothing sent is a failure with the reason", () => {
  const out = describeTestAlert({ sms: { status: "failed" }, email: { status: "failed" } }, to);
  assert.equal(out.ok, false);
  assert.match(out.message, /^Nothing went out/);
  assert.equal(describeTestAlert({ duplicate: true }, to).ok, true);
});

test("the shop export leaves out every live link token", () => {
  const route = readFileSync(new URL("../src/app/api/account/export/route.ts", import.meta.url), "utf8");
  assert.match(route, /techToken: _t, customerConfirmToken: _c/);
  assert.match(route, /estimates\.map\(\(\{ publicToken: _p/);
  assert.match(route, /invoices\.map\(\(\{ publicToken: _p/);
  assert.match(route, /technicians\.map\(publicTechnician\)/);
});

test("the shop's numbers live with Performance, where they are used", () => {
  assert.equal(searchSettings("average ticket")[0].section, "performance");
  assert.equal(searchSettings("baseline")[0].section, "performance");
  assert.equal(sectionFromAnchor("#economics-baseline"), "performance");
  assert.equal(sectionFromAnchor("your-numbers"), "performance");
});
