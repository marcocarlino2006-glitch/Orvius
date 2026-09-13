"use client";

import { useEffect, useState } from "react";

type UsagePayload = {
  planId: string;
  answeredMinutesUsed: number;
  answeredMinutesIncluded: number | null;
  ownerSmsUsed: number;
  ownerSmsIncluded: number | null;
  answeredMinutesPct: number | null;
  ownerSmsPct: number | null;
  nearLimit: boolean;
  callCount: number;
};

function barPct(pct: number | null) {
  if (pct == null) return 0;
  return Math.min(100, pct);
}

/** Fair-use meter for Billing — answered minutes + owner SMS this month. */
export function BillingUsagePanel() {
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/usage")
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load usage");
        return res.json() as Promise<UsagePayload>;
      })
      .then(setUsage)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Usage unavailable"),
      );
  }, []);

  if (error) {
    return <p className="font-sans text-sm text-ash">{error}</p>;
  }

  if (!usage) {
    return <p className="font-sans text-sm text-ash">Loading usage…</p>;
  }

  if (usage.answeredMinutesIncluded == null) {
    return (
      <p className="font-sans text-sm text-ash">
        Subscribe to unlock a fair-use meter on this shop.
      </p>
    );
  }

  return (
    <div className="billing-usage font-sans">
      {usage.nearLimit ? (
        <p className="billing-usage-warn text-sm">
          You&apos;re near this month&apos;s fair use. We&apos;ll warn before any
          overage quote.
        </p>
      ) : (
        <p className="text-sm text-ash">
          Included usage this calendar month · {usage.callCount} calls logged
        </p>
      )}

      <div className="billing-usage-row mt-4">
        <div className="billing-usage-label flex justify-between text-sm">
          <span>Answered minutes</span>
          <span>
            {usage.answeredMinutesUsed} / {usage.answeredMinutesIncluded}
          </span>
        </div>
        <div className="billing-usage-track mt-1" aria-hidden>
          <span
            className="billing-usage-fill"
            style={{ width: `${barPct(usage.answeredMinutesPct)}%` }}
          />
        </div>
      </div>

      <div className="billing-usage-row mt-3">
        <div className="billing-usage-label flex justify-between text-sm">
          <span>Owner SMS alerts</span>
          <span>
            {usage.ownerSmsUsed} / {usage.ownerSmsIncluded}
          </span>
        </div>
        <div className="billing-usage-track mt-1" aria-hidden>
          <span
            className="billing-usage-fill"
            style={{ width: `${barPct(usage.ownerSmsPct)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
