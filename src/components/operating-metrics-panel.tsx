"use client";

import type { OperatingMetric } from "@/lib/operating-metrics";
import { formatCents } from "@/lib/money";
import { useCallback, useEffect, useState } from "react";

function display(m: OperatingMetric) {
  if (m.value == null) return "—";
  if (m.unit === "rate") return `${Math.round(m.value * 100)}%`;
  if (m.unit === "cents") return formatCents(m.value) ?? "$0";
  return String(m.value);
}

function tone(m: OperatingMetric) {
  if (m.value == null || m.unit !== "rate") return "";
  const good = m.goal === "high" ? m.value >= 0.9 : m.value <= 0.05;
  const bad = m.goal === "high" ? m.value < 0.7 : m.value > 0.2;
  return good ? "is-good" : bad ? "is-bad" : "is-watch";
}

/** The loop's scorecard, computed from records and the audit trail. */
export function OperatingMetricsPanel() {
  const [metrics, setMetrics] = useState<OperatingMetric[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch("/api/metrics/operating")
      .then(async (res) => {
        if (!res.ok) throw new Error("Metrics did not load.");
        return res.json();
      })
      .then((data) => setMetrics(data.metrics ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "Metrics did not load."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="ox-state ox-state--failure ox-state--inline" role="alert">
        <p className="ox-state-copy">{error}</p>
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="om-grid" aria-busy="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="skeleton om-skel" />
        ))}
      </div>
    );
  }

  return (
    <ul className="om-grid">
      {metrics.map((m) => (
        <li key={m.key} className={`om-card ${tone(m)}`}>
          <span className="om-value">{display(m)}</span>
          <span className="om-label">{m.label}</span>
          {m.unit === "rate" && m.denominator ? (
            <span className="om-count">
              {m.numerator} of {m.denominator}
            </span>
          ) : null}
          <span className="om-note">{m.note}</span>
        </li>
      ))}
    </ul>
  );
}
