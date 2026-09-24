"use client";

import Link from "next/link";
import type { CommandSignal } from "@/lib/command-model";

/**
 * Five truthful signals. Each one is a count of records and links to the
 * surface that holds them; nothing here is sampled, projected, or simulated.
 */
export function CommandSignals({
  signals,
  loading,
}: {
  signals: CommandSignal[] | null;
  loading: boolean;
}) {
  if (!signals) {
    return (
      <ul className="cs-grid" aria-label="Business signals" aria-busy={loading}>
        {["New demand", "Qualified opportunities", "Jobs in motion", "Attention required", "Revenue at risk"].map(
          (label) => (
            <li key={label} className="cs-card cs-card--loading">
              <p className="cs-label">{label}</p>
              <span className="skeleton cs-skel-value" />
              <span className="skeleton cs-skel-detail" />
            </li>
          ),
        )}
      </ul>
    );
  }

  return (
    <ul className="cs-grid" aria-label="Business signals">
      {signals.map((signal) => (
        <li key={signal.id}>
          <Link href={signal.href} className={`cs-card cs-tone--${signal.tone}`}>
            <p className="cs-label">{signal.label}</p>
            <p className="cs-value">{signal.value}</p>
            <p className="cs-detail">{signal.detail}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
