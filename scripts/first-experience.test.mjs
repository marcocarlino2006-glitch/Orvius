import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { activationChecklist, activationSummary } from "../src/lib/activation.ts";
import { chosenServicesJson, standardServiceNames } from "../src/lib/provision-business.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const proven = { state: "proven", label: "Proven", detail: "Your calls reach Orvius. Proven Oct 8." };
const notProven = { state: "not_proven", label: "Not proven", detail: "Not tested yet." };
const base = {
  lineVerifiedAt: new Date("2026-10-08T12:00:00Z"),
  ownerPhone: "+15125550100",
  ownerEmail: "owner@example.com",
  ownerSmsOptOutAt: null,
  latestAlert: null,
  transferPhone: null,
  transferProvenAt: null,
  connection: notProven,
  level: "alert",
};
const byId = (items) => Object.fromEntries(items.map((i) => [i.id, i]));

test("nothing is called on until a real event proves it", () => {
  const items = byId(activationChecklist(base));
  assert.equal(items.line.state, "live");
  assert.equal(items.alerts.state, "todo", "a saved mobile is not a delivered alert");
  assert.equal(items.alerts.action.kind, "test_alert");
  assert.equal(items.number.state, "todo");
  assert.equal(items.number.action.href, "/dashboard?settings=phone");
  assert.match(items.number.detail, /keep the number/);
});

test("alerts are on only once the carrier confirms delivery", () => {
  const sent = byId(activationChecklist({ ...base, latestAlert: { channel: "sms", status: "sent", deliveryStatus: null, at: new Date() } }));
  assert.equal(sent.alerts.state, "todo");
  assert.match(sent.alerts.detail, /hasn't confirmed/);
  const delivered = byId(activationChecklist({ ...base, latestAlert: { channel: "sms", status: "sent", deliveryStatus: "delivered", at: new Date() } }));
  assert.equal(delivered.alerts.state, "live");
  assert.match(delivered.alerts.detail, /…0100/);
  const failed = byId(activationChecklist({ ...base, latestAlert: { channel: "sms", status: "sent", deliveryStatus: "undelivered", at: new Date() } }));
  assert.equal(failed.alerts.state, "todo");
  assert.match(failed.alerts.detail, /didn't arrive/);
  const stopped = byId(activationChecklist({ ...base, ownerSmsOptOutAt: new Date() }));
  assert.equal(stopped.alerts.state, "off");
  assert.match(stopped.alerts.detail, /START/);
});

test("handoff to a person is explained, and a transfer is proven by a real transferred call", () => {
  const callback = byId(activationChecklist(base));
  assert.equal(callback.handoff.state, "live");
  assert.match(callback.handoff.detail, /call back/);
  const unproven = byId(activationChecklist({ ...base, transferPhone: "+15125550199" }));
  assert.equal(unproven.handoff.state, "todo");
  assert.match(unproven.handoff.detail, /talk to a person/);
  const done = byId(activationChecklist({ ...base, transferPhone: "+15125550199", transferProvenAt: new Date() }));
  assert.equal(done.handoff.state, "live");
});

test("the summary counts what is left in plain words", () => {
  const all = activationChecklist({
    ...base,
    latestAlert: { channel: "sms", status: "sent", deliveryStatus: "delivered", at: new Date() },
    connection: proven,
  });
  assert.equal(activationSummary(all).headline, "Everything is on and proven.");
  assert.match(activationSummary(activationChecklist(base)).headline, /2 things left/);
});

test("the owner chooses the work they take; it's never empty", () => {
  assert.deepEqual(standardServiceNames("HVAC"), ["AC repair", "Heating repair", "Maintenance", "Installation"]);
  const chosen = JSON.parse(chosenServicesJson("HVAC", ["AC repair", "ac repair", "Duct cleaning", "  "]));
  assert.deepEqual(chosen.map((s) => s.name), ["AC repair", "Duct cleaning"]);
  assert.ok(chosen[0].description, "standard work keeps its description");
  assert.equal(chosenServicesJson("HVAC", []), null);
  const api = read("src/app/api/setup/route.ts");
  assert.match(api, /services: z\.array/);
  const ui = read("src/components/turn-on-orvius.tsx");
  assert.match(ui, /The work you take/);
  assert.match(ui, /disabled=\{busy \|\| services\.length === 0\}/);
});

test("after the first real call the owner sees what is live, not a bare 'done'", () => {
  const verify = read("src/components/onboarding-call-verify.tsx");
  assert.match(verify, /<ActivationChecklist \/>/);
  assert.match(verify, /Connect my business number/);
  const route = read("src/app/api/onboarding/live-check/route.ts");
  assert.match(route, /requireEntitledSession/);
  assert.match(route, /assistant-forwarded-call/);
});
