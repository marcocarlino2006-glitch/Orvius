"use client";

import { dollars, type Business, type PatchFn } from "../settings-model";
import { ScField, ScGroup, ScRow } from "../settings-primitives";

export function NumbersGroup({
  b,
  patch,
  setError,
}: {
  b: Business;
  patch: PatchFn;
  setError: (message: string) => void;
}) {
  return (
    <div id="your-numbers">
      <ScGroup title="Your numbers">
        <ScRow label="Average ticket" hint="Estimates booked value on Command. Not money collected.">
          <span className="sc-affix">
            <span>$</span>
            <ScField
              narrow
              ariaLabel="Average ticket in dollars"
              inputMode="numeric"
              value={b.avgTicketCents ? String(Math.round(b.avgTicketCents / 100)) : ""}
              placeholder="285"
              onCommit={(v) => {
                const n = dollars(v);
                if (n != null && (n < 50 || n > 50000)) {
                  setError("Average ticket must be between $50 and $50,000.");
                  return false;
                }
                return patch({ avgTicketCents: n == null ? null : Math.round(n * 100) });
              }}
            />
          </span>
        </ScRow>
        <ScRow label="Missed calls a week before Orvius">
          <ScField
            narrow
            ariaLabel="Missed calls a week before Orvius"
            inputMode="numeric"
            value={b.baselineMissedCallsPerWeek != null ? String(b.baselineMissedCallsPerWeek) : ""}
            placeholder="12"
            onCommit={(v) => {
              const n = dollars(v);
              return patch({ baselineMissedCallsPerWeek: n == null ? null : Math.min(500, Math.round(n)) });
            }}
          />
        </ScRow>
        <ScRow label="Jobs booked a week before Orvius">
          <ScField
            narrow
            ariaLabel="Jobs booked a week before Orvius"
            inputMode="numeric"
            value={b.baselineJobsPerWeek != null ? String(b.baselineJobsPerWeek) : ""}
            placeholder="8"
            onCommit={(v) => {
              const n = dollars(v);
              return patch({ baselineJobsPerWeek: n == null ? null : Math.min(500, Math.round(n)) });
            }}
          />
        </ScRow>
      </ScGroup>
    </div>
  );
}
