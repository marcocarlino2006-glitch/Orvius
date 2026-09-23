import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCarrierDialExample,
  buildForwardGuideSms,
  orviusDialDigits,
} from "../src/lib/carrier-forward.ts";
import { looksLikeSeedProspect } from "../src/lib/multi-b-mastery.ts";

test("carrier dial examples strip +1 and build known GSM strings", () => {
  assert.equal(orviusDialDigits("+15551234567"), "5551234567");
  assert.equal(buildCarrierDialExample("verizon", "+1 (555) 123-4567"), "*715551234567");
  assert.equal(buildCarrierDialExample("att", "5551234567"), "*925551234567");
  assert.equal(buildCarrierDialExample("tmobile", "+15551234567"), "**61*5551234567#");
  assert.equal(buildCarrierDialExample("other", "+15551234567"), null);
});

test("forward guide SMS includes dial try and DONE stamp", () => {
  const sms = buildForwardGuideSms({
    shopName: "Summit HVAC",
    orviusLine: "+15551234567",
    mode: "forward",
    carrier: "verizon",
  });
  assert.match(sms, /Forward missed/);
  assert.match(sms, /\*715551234567/);
  assert.match(sms, /DONE/);
});

test("seed heuristic catches widened aliases without false-positive shops", () => {
  assert.equal(looksLikeSeedProspect("owner@example.com"), true);
  assert.equal(looksLikeSeedProspect("seed+hvac@orvius.im"), true);
  assert.equal(looksLikeSeedProspect("test+lead@gmail.com"), true);
  assert.equal(looksLikeSeedProspect("demo@shop.com"), true);
  assert.equal(looksLikeSeedProspect("fake@localhost"), true);
  assert.equal(looksLikeSeedProspect("mike@summithvac.com"), false);
  assert.equal(looksLikeSeedProspect("owner@acme-hvac.com"), false);
});
