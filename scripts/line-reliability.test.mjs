#!/usr/bin/env node
/*
 * The live line keeps up with the deployed code, and a caller who insists on
 * a person can actually reach one.
 *
 * Found on the production Vapi account: the demo number ran an assistant a
 * month older than the code, with a dead webhook, because assistants were
 * only rewritten when an owner saved Settings. And the receptionist had no
 * way to hand a caller to a human — the most repeated complaint in public
 * reviews of AI receptionists.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { assistantConfigFingerprint, buildVapiAssistantConfig } from "../src/lib/vapi.ts";
import { buildAssistantSystemPrompt } from "../src/lib/business.ts";

const base = { businessName: "Lakeside Heating", systemPrompt: "prompt v1", greeting: "Hi", webhookUrl: "https://api.orvius.im/api/webhooks/vapi" };

test("every assistant carries a fingerprint of the config it was built from", () => {
  const a = buildVapiAssistantConfig(base);
  assert.match(a.metadata.orviusConfig, /^[0-9a-f]{16}$/);
  assert.equal(buildVapiAssistantConfig(base).metadata.orviusConfig, a.metadata.orviusConfig, "same input, same fingerprint");
  assert.notEqual(
    buildVapiAssistantConfig({ ...base, systemPrompt: "prompt v2" }).metadata.orviusConfig,
    a.metadata.orviusConfig,
    "a prompt change must read as drift",
  );
  assert.equal(
    buildVapiAssistantConfig({ ...base, webhookSecret: "rotated" }).metadata.orviusConfig,
    a.metadata.orviusConfig,
    "rotating the webhook secret is not drift, and the secret never feeds a value stored in Vapi",
  );
  assert.equal(assistantConfigFingerprint(a), a.metadata.orviusConfig, "the fingerprint ignores itself");
});

test("a transfer number adds a transfer tool; without one there is none", () => {
  assert.equal(buildVapiAssistantConfig(base).model.tools, undefined);
  const withTransfer = buildVapiAssistantConfig({ ...base, transferPhone: "+13125550100" });
  const [tool] = withTransfer.model.tools;
  assert.equal(tool.type, "transferCall");
  assert.equal(tool.destinations[0].number, "+13125550100");
  assert.notEqual(withTransfer.metadata.orviusConfig, buildVapiAssistantConfig(base).metadata.orviusConfig);
});

test("the prompt only offers a live transfer when one is configured", () => {
  const shop = { name: "Lakeside Heating", greeting: null, hoursJson: "{}", servicesJson: "[]", trade: "HVAC" };
  const off = buildAssistantSystemPrompt(shop);
  const on = buildAssistantSystemPrompt({ ...shop, canTransfer: true });
  assert.doesNotMatch(off, /transfer tool/);
  assert.match(on, /Get their name and callback number first[\s\S]*use the transfer tool/);
  assert.match(on, /If the transfer does not go through/);
  for (const prompt of [off, on]) assert.doesNotMatch(prompt, /within \d+ minutes/i);
});
