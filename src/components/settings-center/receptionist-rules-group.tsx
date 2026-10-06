"use client";

import { useEffect, useState } from "react";
import type { ReceptionistRule } from "@/lib/receptionist-rules";
import { ScGroup, ScRow } from "./settings-primitives";

/** The corrections the owner made from call pages; removing one takes it off the next call. */
export function ReceptionistRulesGroup() {
  const [rules, setRules] = useState<ReceptionistRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/account/receptionist-rules")
      .then((res) => (res.ok ? res.json() : { rules: [] }))
      .then((data: { rules?: ReceptionistRule[] }) => live && setRules(data.rules ?? []))
      .catch(() => live && setRules([]));
    return () => {
      live = false;
    };
  }, []);

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/account/receptionist-rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { rules?: ReceptionistRule[]; error?: string };
    if (!res.ok) setError(data.error ?? "Could not remove it. Try again.");
    else setRules(data.rules ?? []);
  }

  return (
    <ScGroup title="Corrections">
      <ScRow
        stack
        label="What the receptionist was told"
        hint="Add one from any call's page with “Correct the receptionist”. Every call follows these; safety rules always come first."
      >
        {rules === null ? null : rules.length === 0 ? (
          <p className="font-sans text-sm text-ash">No corrections yet.</p>
        ) : (
          <ul className="font-sans text-sm">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-start justify-between gap-3 py-1.5">
                <span>{rule.text}</span>
                <button type="button" className="sc-btn" onClick={() => void remove(rule.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {error ? <p className="mt-2 font-sans text-sm text-flare-dim">{error}</p> : null}
      </ScRow>
    </ScGroup>
  );
}
