import { trustSignals } from "@/lib/trust";

type TrustMetricsProps = {
  variant?: "light" | "dark";
};

export function TrustMetrics({ variant = "light" }: TrustMetricsProps) {
  return (
    <dl
      className={`trust-metrics trust-metrics-${variant}`}
      aria-label="Orvius proof points"
    >
      {trustSignals.map((item) => (
        <div key={item.label} className="trust-metric">
          <dt className="trust-metric-value font-serif">{item.value}</dt>
          <dd className="trust-metric-label font-sans">{item.label}</dd>
          <dd className="trust-metric-detail font-sans">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
