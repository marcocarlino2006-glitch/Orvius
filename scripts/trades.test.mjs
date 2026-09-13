#!/usr/bin/env node
/*
 * Which trade a shop is, inferred from what it calls itself and what it sells.
 *
 * This decides which prompt pack the receptionist answers with, so getting it
 * wrong means an HVAC caller is asked plumbing questions at two in the
 * morning. The file used to re-implement the inference with a shortened
 * keyword list — four HVAC terms against the real eight — so it graded a
 * classifier the product does not have and could not have caught a keyword
 * being dropped. It imports the real one now.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { TRADES, inferTradeFromBusiness, tradePromptPack } from "../src/lib/trades.ts";

test("a shop is read from its name and its services together", () => {
  assert.equal(
    inferTradeFromBusiness({
      name: "Summit HVAC",
      servicesJson: JSON.stringify([{ name: "AC repair" }]),
    }),
    "HVAC",
  );

  assert.equal(
    inferTradeFromBusiness({
      name: "Pipe Pros",
      servicesJson: JSON.stringify([{ name: "Drain cleaning" }]),
    }),
    "Plumbing",
  );

  assert.equal(
    inferTradeFromBusiness({
      name: "Bright Spark",
      servicesJson: JSON.stringify([{ name: "Panel upgrades", description: "breaker work" }]),
    }),
    "Electrical",
  );
});

test("a name alone is enough when it says the trade", () => {
  assert.equal(inferTradeFromBusiness({ name: "Northline Heating & Air" }), "HVAC");
  assert.equal(inferTradeFromBusiness({ name: "Hollis Plumbing" }), "Plumbing");
  assert.equal(inferTradeFromBusiness({ name: "Cedar Electric" }), "Electrical");
});

test("a shop that says nothing identifying gets no pack", () => {
  assert.equal(inferTradeFromBusiness({ name: "Generic Shop", servicesJson: "[]" }), null);
  assert.equal(inferTradeFromBusiness({}), null);
  assert.equal(
    inferTradeFromBusiness({ name: "Summit HVAC", servicesJson: "not json" }),
    "HVAC",
    "unparseable services do not take the name down with them",
  );
});

test("the strongest signal wins when a shop mentions two trades", () => {
  assert.equal(
    inferTradeFromBusiness({
      name: "All Trades Co",
      servicesJson: JSON.stringify([
        { name: "Drain cleaning", description: "sewer and pipe work, water heater swaps" },
        { name: "Outlet repair" },
      ]),
    }),
    "Plumbing",
  );
});

test("the way shops actually describe themselves is recognised", () => {
  /*
    Each of these turns on a keyword the old mirrored copy did not have, which
    is how it graded a four-term HVAC classifier while the product shipped an
    eight-term one. Dropping any of them silently sends a caller to the wrong
    prompt pack, so they are spelled out as the phrases a shop would use.
  */
  const shops = [
    ["Reliable Cooling Co", "HVAC"],
    ["Valley Heat Pump Service", "HVAC"],
    ["A/C Doctors", "HVAC"],
    ["Coastal Air Conditioning", "HVAC"],
    ["Metro Sewer & Drain", "Plumbing"],
    ["Copper Pipe Co", "Plumbing"],
    ["Toilet & Faucet Repair Inc", "Plumbing"],
    ["Statewide Wiring", "Electrical"],
    ["Lighting and Power Services", "Electrical"],
  ];

  for (const [name, expected] of shops) {
    assert.equal(inferTradeFromBusiness({ name }), expected, name);
  }
});

test("every trade has a pack, and each pack is about that trade", () => {
  /* The inference is only worth anything if the thing it selects exists. */
  for (const trade of TRADES) {
    const pack = tradePromptPack(trade);
    assert.ok(pack.length > 200, `${trade} pack is substantive`);
    assert.match(pack, new RegExp(`TRADE — ${trade.toUpperCase()}`));
    assert.match(pack, /Emergency signals:/);
    assert.match(pack, /Never /, "each pack names something not to promise");
  }
});
