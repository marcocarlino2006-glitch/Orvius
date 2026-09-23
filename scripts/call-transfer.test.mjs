import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOwnerTransferTool,
  transferPromptRule,
} from "../src/lib/call-transfer.ts";
import { buildVapiAssistantConfig } from "../src/lib/vapi.ts";

test("owner cell becomes a transferCall destination", () => {
  const tool = buildOwnerTransferTool("+1 (555) 555-0199");
  assert.ok(tool);
  assert.equal(tool.type, "transferCall");
  assert.equal(tool.destinations[0]?.number, "+15555550199");
  assert.match(tool.destinations[0]?.message ?? "", /Transferring/i);
});

test("missing or junk owner phone means no transfer tool", () => {
  assert.equal(buildOwnerTransferTool(null), null);
  assert.equal(buildOwnerTransferTool(""), null);
  assert.equal(buildOwnerTransferTool("123"), null);
});

test("assistant config attaches transfer tool when ownerPhone is set", () => {
  const withOwner = buildVapiAssistantConfig({
    businessName: "Summit HVAC",
    systemPrompt: "test",
    greeting: "Hello",
    webhookUrl: "https://example.com/hook",
    ownerPhone: "+15555550123",
  });
  assert.equal(withOwner.model.tools?.length, 1);
  assert.equal(withOwner.model.tools?.[0]?.type, "transferCall");

  const without = buildVapiAssistantConfig({
    businessName: "Summit HVAC",
    systemPrompt: "test",
    greeting: "Hello",
    webhookUrl: "https://example.com/hook",
  });
  assert.equal(without.model.tools, undefined);
});

test("prompt rule tells the model to transfer when the tool exists", () => {
  assert.match(transferPromptRule(true), /transferCall/);
  assert.match(transferPromptRule(false), /call you back/);
  assert.doesNotMatch(transferPromptRule(true), /no live transfer/i);
});
