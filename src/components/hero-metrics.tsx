const metrics = [
  { value: "100%", label: "Inbound calls answered" },
  { value: "<3s", label: "Time to first response" },
  { value: "24/7", label: "After-hours coverage" },
  { value: "3", label: "Trades at launch" },
] as const;

export function HeroMetrics() {
  return (
    <div className="hero-metrics anim-rise anim-rise-delay-3">
      <div className="hero-metrics-grid">
        {metrics.map((item, i) => (
          <div key={item.label} className="hero-metric">
            {i > 0 ? (
              <span className="hero-metric-divider" aria-hidden />
            ) : null}
            <p className="hero-metric-value font-serif text-chalk">{item.value}</p>
            <p className="hero-metric-label font-sans text-ash-soft">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
