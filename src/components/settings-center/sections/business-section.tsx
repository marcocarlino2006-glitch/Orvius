"use client";

import { TRADES, type Trade } from "@/lib/trades";
import type { Business, PatchFn } from "../settings-model";
import { ScField, ScGroup, ScRow, ScSwitch } from "../settings-primitives";

export function BusinessSection({ b, patch }: { b: Business; patch: PatchFn }) {
  return (
    <>
      <ScGroup>
        <ScRow label="Business name" hint="What callers hear when the line answers.">
          <ScField
            ariaLabel="Business name"
            value={b.name}
            onCommit={(v) => (v.trim().length >= 2 ? patch({ name: v.trim() }) : false)}
          />
        </ScRow>
        <ScRow label="Business type" hint="Sets receptionist language and emergency rules.">
          <select
            className="sc-input sc-input--select"
            aria-label="Business type"
            value={b.trade ?? "HVAC"}
            onChange={(e) => void patch({ trade: e.target.value as Trade })}
          >
            {TRADES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </ScRow>
        <ScRow label="Shop address" hint="Used for directions and travel time.">
          <ScField
            ariaLabel="Shop address"
            value={b.address ?? ""}
            placeholder="Street, city, state"
            autoComplete="street-address"
            onCommit={(v) => patch({ address: v.trim() || null })}
          />
        </ScRow>
      </ScGroup>
      <ScGroup title="Orvius Network">
        <ScRow
          label="Pass and receive jobs"
          hint={`When you can't take a job, reply PASS to its alert and Orvius offers it to a nearby ${b.trade ? `${b.trade} shop` : "shop"} on Orvius. You get offered theirs, and the first to reply TAKE gets it. Callers are always asked before anything is shared. A network job's card bill carries a 5% Orvius fee, and half of it comes back to the shop that passed the job as credit on its Orvius bill.`}
        >
          <ScSwitch
            label="Orvius Network"
            checked={Boolean(b.networkOn)}
            onChange={(next) => void patch({ networkOn: next })}
          />
        </ScRow>
      </ScGroup>
    </>
  );
}
