import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { describeTestAlert } = await import("../src/lib/test-alert-message.ts");
const { searchSettings, sectionFromAnchor } = await import("../src/lib/settings-center.ts");

const to = { phone: "+1 312 555 0100", email: "owner@shop.test" };

test("a test alert only says it worked for the channels that delivered", () => {
  assert.deepEqual(describeTestAlert({ sms: { status: "sent" }, email: { status: "sent" } }, to), {
    ok: true,
    partial: false,
    message: "Texted +1 312 555 0100 and emailed owner@shop.test.",
  });
  assert.equal(describeTestAlert({ sms: { status: "sent" } }, to).message, "Texted +1 312 555 0100.");
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

test("nothing delivered is a failure with the reason", () => {
  const out = describeTestAlert({ sms: { status: "failed" }, email: { status: "failed" } }, to);
  assert.equal(out.ok, false);
  assert.match(out.message, /^Nothing was delivered/);
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
