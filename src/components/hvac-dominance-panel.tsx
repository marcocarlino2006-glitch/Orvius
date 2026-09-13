"use client";

import { ShellPanel } from "@/components/shell-primitives";
import {
  DOMINANCE_CAPABILITIES,
  DOMINANCE_INTRO,
  FOUNDER_FOCUS,
  MOAT_LAYERS,
  MOAT_STRATEGIC_TEST,
} from "@/lib/hvac-dominance";

/**
 * HVAC dominance capabilities + compounding moat — founder reference in product.
 */
export function HvacDominancePanel() {
  return (
    <div className="space-y-6" id="hvac-dominance">
      <ShellPanel title="HVAC dominance capabilities">
        <p className="font-sans text-sm text-ash">{DOMINANCE_INTRO}</p>
        <ol className="mt-4 space-y-4 font-sans text-sm">
          {DOMINANCE_CAPABILITIES.map((cap) => (
            <li
              key={cap.id}
              className="rounded-md border border-rule bg-fog/40 p-3"
            >
              <p className="font-semibold text-void">{cap.title}</p>
              <p className="mt-1 text-xs text-ash">{cap.body}</p>
            </li>
          ))}
        </ol>
      </ShellPanel>

      <ShellPanel title="The moat that compounds" dense>
        <p className="mb-3 font-sans text-xs text-ash">
          Orvius defensibility should compound in this order:
        </p>
        <ul className="space-y-2 font-sans text-sm">
          {MOAT_LAYERS.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-1 border-b border-rule pb-2 last:border-0 sm:flex-row sm:justify-between sm:gap-4"
            >
              <span className="font-semibold text-void">{row.layer}</span>
              <span className="text-xs text-ash sm:max-w-[65%] sm:text-right">
                {row.compounds}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 font-sans text-sm text-ash">{MOAT_STRATEGIC_TEST}</p>
      </ShellPanel>

      <ShellPanel title="The founder focus" dense>
        <p className="font-sans text-sm text-ash">{FOUNDER_FOCUS}</p>
      </ShellPanel>
    </div>
  );
}
