#!/usr/bin/env node
/*
 * The signed-out demo: a visitor's throwaway shop runs the real pipeline and
 * returns the step-by-step trail, the same one an owner reads in Command.
 */
import assert from "node:assert/strict";
import test from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { newVisitorId, isVisitorId, visitorOwnerEmail, visitorWorkspace, runPublicScenario, confirmPublicJob, publicScenarios } =
  await import("../src/lib/public-demo.ts");

test("visitor ids are strict and visitor shops can never be signed into", () => {
  const id = newVisitorId();
  assert.ok(isVisitorId(id));
  assert.equal(isVisitorId("../../etc"), false);
  assert.equal(isVisitorId(undefined), false);
  assert.match(visitorOwnerEmail(id), /@demo\.invalid$/);
  assert.equal(publicScenarios().length, 6);
});

test("a visitor runs a call, books, confirms, and repeats without a duplicate job", async () => {
  const id = newVisitorId();
  assert.equal(await visitorWorkspace(id, false), null);
  const shop = await visitorWorkspace(id, true);
  assert.equal(shop.environment, "demo");
  assert.equal((await visitorWorkspace(id, true)).id, shop.id);

  const run = await runPublicScenario(shop, "no_cool");
  assert.ok(run.trace?.job, "booked a job");
  assert.ok(run.trace.events.length >= 3, "trail has steps");
  assert.ok(run.trace.events.some((e) => e.simulated), "texts are marked simulated");

  const confirmed = await confirmPublicJob(shop, run.trace.job.id);
  assert.ok(confirmed.trace?.job?.customerConfirmedAt);

  const again = await runPublicScenario(shop, "repeat_caller");
  assert.equal(again.duplicate, true);
  assert.equal(again.trace?.job?.id, run.trace.job.id);
});

test("a gas smell books nothing and the bounced text shows as failed", async () => {
  const shop = await visitorWorkspace(newVisitorId(), true);
  const gas = await runPublicScenario(shop, "gas_smell");
  assert.equal(gas.trace?.job ?? null, null);
  const bounced = await runPublicScenario(shop, "bounced_text");
  assert.ok(bounced.trace.events.some((e) => e.tone === "failed"));
});
