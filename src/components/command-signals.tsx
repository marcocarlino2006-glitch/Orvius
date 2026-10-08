"use client";

import Link from "next/link";
import type { CommandSignal } from "@/lib/command-model";

/**
 * Three counts of records, each linking to the screen that holds them;
 * nothing here is sampled, projected, or simulated.
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
      <ul className="cs-grid" aria-label="Summary" aria-busy={loading}>
        {["Requests awaiting a response", "Upcoming jobs", "Exceptions"].map(
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
    <ul className="cs-grid" aria-label="Summary">
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
