export const TRADES = ["HVAC", "Plumbing", "Electrical"] as const;
export type Trade = (typeof TRADES)[number];

/*
  Word boundaries rather than padded spaces. Two of these used to be written
  as "ac " and " a/c", which is a word boundary spelled as a character that
  only exists between words — so "A/C Doctors" and "Summit AC" matched
  nothing, because the padding they needed was off the end of the name. A shop
  that matches nothing gets no prompt pack, and answers an air-conditioning
  call with the generic script at two in the morning.
*/
const TRADE_KEYWORDS: Record<Trade, RegExp[]> = {
  HVAC: [
    /hvac/,
    /\bac\b/,
    /\ba\/c\b/,
    /air condition/,
    /heat/,
    /furnace/,
    /cooling/,
    /heat pump/,
  ],
  Plumbing: [
    /plumb/,
    /drain/,
    /leak/,
    /water heater/,
    /sewer/,
    /pipe/,
    /toilet/,
    /faucet/,
  ],
  Electrical: [
    /electric/,
    /outlet/,
    /panel/,
    /breaker/,
    /wiring/,
    /light/,
    /power/,
  ],
};

/** Infer primary trade from servicesJson or shop name for prompt packs. */
export function inferTradeFromBusiness(input: {
  servicesJson?: string | null;
  name?: string | null;
}): Trade | null {
  let haystack = (input.name ?? "").toLowerCase();

  if (input.servicesJson) {
    try {
      const services = JSON.parse(input.servicesJson) as Array<{ name?: string; description?: string }>;
      haystack += ` ${services.map((s) => `${s.name ?? ""} ${s.description ?? ""}`).join(" ")}`.toLowerCase();
    } catch {
      /* ignore */
    }
  }

  let best: Trade | null = null;
  let bestScore = 0;

  for (const trade of TRADES) {
    const score = TRADE_KEYWORDS[trade].filter((kw) => kw.test(haystack)).length;
    if (score > bestScore) {
      bestScore = score;
      best = trade;
    }
  }

  return bestScore > 0 ? best : null;
}

export function tradePromptPack(trade: Trade): string {
  switch (trade) {
    case "HVAC":
      return `TRADE — HVAC
- Common calls: no AC in summer, no heat in winter, weird noises, weak airflow, thermostat issues, maintenance/tune-ups, new system quotes.
- Emergency signals: no cooling when it's hot, no heat when it's cold, burning smell from unit, water leaking from indoor unit.
- Ask: system type if they know (central AC, heat pump, furnace), whether system is running at all, and floor/room affected.
- Never quote equipment prices or promise same-day install.`;
    case "Plumbing":
      return `TRADE — PLUMBING
- Common calls: active leaks, clogged drains, water heater failure, running toilets, low pressure, sewer smell, burst pipe.
- Emergency signals: active leak/flooding, no water, sewer backup, water heater leaking, gas water heater issues.
- Ask: is water still flowing, can they shut off the main, which fixture/room, how long it's been happening.
- Never quote flat rates or promise a fix without diagnosis.`;
    case "Electrical":
      return `TRADE — ELECTRICAL
- Common calls: partial power loss, tripping breakers, dead outlets, flickering lights, panel upgrades, new circuits.
- Emergency signals: burning smell, sparking, shock, full power loss, exposed wires — treat as emergency; mention 911 if immediate danger.
- Ask: whole home vs one room, breaker tripped or not, when it started, any recent work done.
- Never instruct DIY on panel work; always capture address for dispatch.`;
  }
}
