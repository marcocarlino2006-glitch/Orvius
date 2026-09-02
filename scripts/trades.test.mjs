#!/usr/bin/env node
import assert from "node:assert/strict";

const TRADES = ["HVAC", "Plumbing", "Electrical"];

const TRADE_KEYWORDS = {
  HVAC: ["hvac", "ac ", "heat", "furnace"],
  Plumbing: ["plumb", "drain", "leak", "water heater"],
  Electrical: ["electric", "outlet", "panel", "breaker"],
};

function inferTradeFromBusiness(input) {
  let haystack = (input.name ?? "").toLowerCase();

  if (input.servicesJson) {
    try {
      const services = JSON.parse(input.servicesJson);
      haystack += ` ${services.map((s) => `${s.name ?? ""} ${s.description ?? ""}`).join(" ")}`.toLowerCase();
    } catch {
      /* ignore */
    }
  }

  let best = null;
  let bestScore = 0;

  for (const trade of TRADES) {
    const score = TRADE_KEYWORDS[trade].filter((kw) => haystack.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      best = trade;
    }
  }

  return bestScore > 0 ? best : null;
}

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

assert.equal(inferTradeFromBusiness({ name: "Generic Shop", servicesJson: "[]" }), null);

console.log("trades.test.mjs: ok");
