"use client";

type Ring1TrustStripProps = {
  businessName?: string | null;
  className?: string;
};

const signals = [
  { label: "Line status", value: "Operational", live: true },
  { label: "Coverage", value: "24/7 · After hours" },
  { label: "Owner alerts", value: "< 60s SMS" },
  { label: "Lead capture", value: "Automatic" },
];

export function Ring1TrustStrip({ businessName, className = "" }: Ring1TrustStripProps) {
  return (
    <div className={`ring1-trust-strip ${className}`} role="status" aria-label="Ring 1 system status">
      <div className="ring1-trust-strip-brand font-sans">
        <span className="home-os-live-dot" />
        <span>
          {businessName ?? "Summit HVAC"} · Ring 1 front door
        </span>
      </div>
      <ul className="ring1-trust-strip-list font-sans">
        {signals.map((item) => (
          <li key={item.label} className="ring1-trust-strip-item">
            <span className="ring1-trust-strip-label">{item.label}</span>
            <span className={`ring1-trust-strip-value ${item.live ? "ring1-trust-strip-live" : ""}`}>
              {item.live ? <span className="home-os-live-dot" aria-hidden /> : null}
              {item.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
