"use client";

import { TRADES } from "@/lib/trades";
import type { Business, PatchFn } from "../settings-model";
import { ScField, ScGroup, ScRow } from "../settings-primitives";

export function BusinessSection({ b, patch }: { b: Business; patch: PatchFn }) {
  return (
    <ScGroup>
      <ScRow label="Business name" hint="What callers hear when the line answers.">
        <ScField
          ariaLabel="Business name"
          value={b.name}
          onCommit={(v) => (v.trim().length >= 2 ? patch({ name: v.trim() }) : false)}
        />
      </ScRow>
      <ScRow label="Trade" hint="Sets receptionist language and emergency rules.">
        <div className="sc-segment" role="radiogroup" aria-label="Trade">
          {TRADES.map((item) => (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={(b.trade ?? "HVAC") === item}
              className={(b.trade ?? "HVAC") === item ? "is-active" : ""}
              onClick={() => void patch({ trade: item })}
            >
              {item}
            </button>
          ))}
        </div>
      </ScRow>
      <ScRow label="Shop address" hint="Used for directions and travel time.">
        <ScField
          ariaLabel="Shop address"
          value={b.address ?? ""}
          placeholder="1842 Oak Street, Austin TX"
          autoComplete="street-address"
          onCommit={(v) => patch({ address: v.trim() || null })}
        />
      </ScRow>
    </ScGroup>
  );
}
