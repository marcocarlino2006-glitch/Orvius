#!/usr/bin/env node
/*
 * Readiness is three facts, not one word. The audit found Command saying the
 * line "Answers" while phone setup said forwarding was "Not proven yet", and
 * "Alert delivery: Delivering" beside old failed alerts and a last delivery
 * over a month old. These pin each state apart.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const { shopReadiness, lineReadiness, forwardingReadiness, alertReadiness } = await import("../src/lib/readiness.ts");

const NOW = Date.parse("2026-10-14T15:00:00Z");
const ago = (days) => new Date(NOW - days * 86_400_000).toISOString();
const base = {
  line: "+13125550100",
  lineVerifiedAt: ago(40),
  lastCallAt: ago(0.1),
  forwardConfirmedAt: null,
  forwardProvenAt: null,
  lastForwardTest: null,
  alertsReachable: true,
  lastAlertAt: ago(0.2),
  lastFailedAlertAt: null,
  failedAlerts24h: 0,
  stuckPendingAlerts: 0,
};

test("the Orvius number answering and the shop's own number forwarding are separate rows", () => {
  const [line, forwarding] = shopReadiness(base, NOW);
  assert.equal(line.label, "Orvius number");
  assert.equal(line.summary, "Answers calls made to it");
  assert.equal(line.tone, "ok");
  assert.equal(forwarding.label, "Your business number");
  assert.match(forwarding.summary, /not proven yet — calls to your number may not reach Orvius/);
  assert.equal(forwarding.verified.ok, false);
  assert.equal(forwarding.healthy.ok, null, "unknown, not healthy and not failing");
  assert.notEqual(forwarding.tone, "ok");
  assert.equal(forwarding.action, "forward_test");
});

test("an owner saying forwarding is on is configured, not verified", () => {
  const f = forwardingReadiness({ ...base, forwardConfirmedAt: ago(2) }, NOW);
  assert.equal(f.configured.ok, true);
  assert.equal(f.configured.text, "You said forwarding is on");
  assert.equal(f.verified.ok, false);
});

test("forwarding proven long ago is verified but not currently healthy; a newer failed test is failing", () => {
  const old = forwardingReadiness({ ...base, forwardConfirmedAt: ago(30), forwardProvenAt: ago(30) }, NOW);
  assert.equal(old.verified.ok, true);
  assert.equal(old.healthy.ok, null);
  assert.match(old.summary, /run a test to confirm it still does/);

  const broke = forwardingReadiness(
    { ...base, forwardProvenAt: ago(30), lastForwardTest: { state: "answered_elsewhere", at: ago(1) } },
    NOW,
  );
  assert.equal(broke.healthy.ok, false);
  assert.equal(broke.tone, "risk");

  const fresh = forwardingReadiness({ ...base, forwardProvenAt: ago(30), lastForwardTest: { state: "reached", at: ago(1) } }, NOW);
  assert.equal(fresh.healthy.ok, true);
  assert.equal(fresh.tone, "ok");
});

test("a line verified once with no recent calls does not claim it answers now", () => {
  const l = lineReadiness({ ...base, lastCallAt: ago(35) }, NOW);
  assert.equal(l.verified.ok, true);
  assert.equal(l.healthy.ok, null);
  assert.match(l.healthy.text, /No call in 35 days/);
  assert.doesNotMatch(l.summary, /^Answers/);
});

test("alerts: an old failure after the last delivery and a month-old delivery are never 'Delivering'", () => {
  const audit = alertReadiness({ ...base, lastAlertAt: ago(34), lastFailedAlertAt: ago(20) }, NOW);
  assert.equal(audit.verified.ok, true, "it has delivered before");
  assert.equal(audit.healthy.ok, false, "the newest attempt failed");
  assert.equal(audit.summary, "Alerts are failing");
  assert.equal(audit.action, "test_alert");

  const stale = alertReadiness({ ...base, lastAlertAt: ago(34) }, NOW);
  assert.equal(stale.healthy.ok, null);
  assert.match(stale.healthy.text, /Last delivered 34 days ago/);
  assert.match(stale.summary, /No recent delivery — send a test alert/);
  assert.equal(stale.tone, "attention");

  const recovered = alertReadiness({ ...base, lastAlertAt: ago(1), lastFailedAlertAt: ago(20) }, NOW);
  assert.equal(recovered.healthy.ok, true, "a delivery after the failure clears it");
});

test("alerts with nowhere to go are not configured, whatever was delivered before", () => {
  const a = alertReadiness({ ...base, alertsReachable: false }, NOW);
  assert.equal(a.configured.ok, false);
  assert.equal(a.action, "fix_alerts");
  assert.equal(a.tone, "risk");
});

test("Command renders all three states per row, and no bare 'Delivering' or 'Answers'", () => {
  const pulse = readFileSync(new URL("../src/components/orvius-pulse.tsx", import.meta.url), "utf8");
  assert.match(pulse, /shopReadiness\(/);
  for (const label of ["Set up", "Verified", "Healthy now"]) assert.match(pulse, new RegExp(`"${label}"`));
  assert.doesNotMatch(pulse, /"Delivering"/);
  assert.doesNotMatch(pulse, /`Answers/);
  const health = readFileSync(new URL("../src/lib/shop-health.ts", import.meta.url), "utf8");
  assert.match(health, /lastFailedAlertAt:/);
  assert.match(health, /forwardConfirmedAt:/);
});

test("future-dated or unreadable evidence never makes anything read ready now", () => {
  const ahead = (days) => new Date(NOW + days * 86_400_000).toISOString();
  const future = { ...base, lineVerifiedAt: ahead(3), lastCallAt: ahead(2), forwardProvenAt: ahead(1), lastAlertAt: ahead(1) };
  const [line, forwarding, alerts] = shopReadiness(future, NOW);
  assert.notEqual(line.healthy.ok, true);
  assert.equal(line.verified.ok, false, "a test call dated next week did not happen");
  assert.notEqual(line.tone, "ok");
  assert.notEqual(forwarding.healthy.ok, true);
  assert.equal(forwarding.verified.ok, false);
  assert.notEqual(alerts.healthy.ok, true);
  assert.notEqual(alerts.summary, "Alerts are reaching you");

  const garbled = shopReadiness({ ...base, lastCallAt: "not a date", lastAlertAt: "soon" }, NOW);
  assert.notEqual(garbled[0].healthy.ok, true);
  assert.notEqual(garbled[2].healthy.ok, true);

  const futureSuccessHidesFailure = alertReadiness({ ...base, lastAlertAt: ahead(1), lastFailedAlertAt: ago(0.5) }, NOW);
  assert.equal(futureSuccessHidesFailure.healthy.ok, false, "a future-dated success cannot paper over a real failure");

  const stale = shopReadiness({ ...base, lastCallAt: ago(30), lastAlertAt: ago(30) }, NOW);
  assert.equal(stale[0].healthy.ok, null);
  assert.equal(stale[2].healthy.ok, null);
  assert.equal(stale[0].verified.ok, true, "history stays history: the test call still happened");

  const skew = lineReadiness({ ...base, lastCallAt: new Date(NOW + 60_000).toISOString() }, NOW);
  assert.equal(skew.healthy.ok, true, "a minute of clock skew is not a fabrication");
});
