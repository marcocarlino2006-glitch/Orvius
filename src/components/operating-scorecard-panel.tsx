"use client";

import { ShellBadge, ShellPanel } from "@/components/shell-primitives";
import {
  BUSINESS_METRICS,
  CUSTOMER_OUTCOME_METRICS,
  EXPANSION_GATES,
  PRODUCT_QUALITY_COPY,
  SCORECARD_CORE_RULE,
  type ExpansionGateId,
  type ExpansionGatesState,
} from "@/lib/operating-scorecard";

type Props = {
  gates: ExpansionGatesState;
  saving?: boolean;
  onToggleGate: (id: ExpansionGateId) => void;
};

/**
 * Founder operating scorecard — metrics reference + checkable expansion gates.
 */
export function OperatingScorecardPanel({
  gates,
  saving,
  onToggleGate,
}: Props) {
  const closed = EXPANSION_GATES.filter((g) => gates[g.id]).length;

  return (
    <div className="space-y-6" id="operating-scorecard">
      <ShellPanel
        title="Operating scorecard"
        action={
          <ShellBadge tone={closed === EXPANSION_GATES.length ? "live" : "flare"}>
            Expansion {closed}/{EXPANSION_GATES.length}
          </ShellBadge>
        }
      >
        <p className="font-sans text-sm text-ash">{SCORECARD_CORE_RULE}</p>
      </ShellPanel>

      <ShellPanel title="Expansion gates" dense>
        <p className="mb-3 font-sans text-xs text-ash">
          Check only when proven — not when hoped. Saves on this shop.
          {saving ? " · Saving…" : ""}
        </p>
        <ul className="space-y-3">
          {EXPANSION_GATES.map((gate) => {
            const ok = gates[gate.id];
            return (
              <li
                key={gate.id}
                className={`rounded-md border p-3 font-sans text-sm ${
                  ok
                    ? "border-live/40 bg-live/5"
                    : "border-rule bg-fog/40"
                }`}
              >
                <label className="flex cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={ok}
                    onChange={() => onToggleGate(gate.id)}
                    aria-label={gate.title}
                  />
                  <span>
                    <span className="block font-semibold text-void">
                      {gate.title}
                    </span>
                    <span className="mt-1 block text-xs text-ash">
                      {gate.detail}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </ShellPanel>

      <details className="pro-settings-secondary">
        <summary>Customer outcome metrics</summary>
        <div className="pro-settings-secondary-body">
          <ul className="space-y-3 font-sans text-sm">
            {CUSTOMER_OUTCOME_METRICS.map((row) => (
              <li key={row.id} className="border-b border-rule pb-3 last:border-0">
                <p className="font-semibold text-void">{row.question}</p>
                <p className="mt-1 text-xs text-ash">{row.why}</p>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <details className="pro-settings-secondary">
        <summary>Product quality metrics</summary>
        <div className="pro-settings-secondary-body font-sans text-sm text-ash">
          <p>{PRODUCT_QUALITY_COPY.summary}</p>
          <p className="mt-2">
            Critical: {PRODUCT_QUALITY_COPY.criticalMetrics.join(", ")}.
          </p>
          <p className="mt-2">{PRODUCT_QUALITY_COPY.thresholdRule}</p>
        </div>
      </details>

      <details className="pro-settings-secondary">
        <summary>Business metrics</summary>
        <div className="pro-settings-secondary-body">
          <ul className="space-y-3 font-sans text-sm">
            {BUSINESS_METRICS.map((row) => (
              <li key={row.id} className="border-b border-rule pb-3 last:border-0">
                <p className="font-semibold text-void">{row.metric}</p>
                <p className="mt-1 text-xs text-ash">{row.strong}</p>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </div>
  );
}
