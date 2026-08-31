"use client";

type Ring1TrustStripProps = {
  businessName?: string | null;
  line?: string | null;
  className?: string;
};

export function Ring1TrustStrip({
  businessName,
  line,
  className = "",
}: Ring1TrustStripProps) {
  const tenant = businessName ?? "Your business";

  return (
    <div
      className={`ring1-trust-strip ${className}`}
      role="status"
      aria-label="Line status"
    >
      <div className="ring1-trust-strip-brand font-sans">
        <span className="pro-live-dot" />
        <span>{tenant} · Line active</span>
      </div>
      <ul className="ring1-trust-strip-list font-sans">
        <li className="ring1-trust-strip-item">
          <span className="ring1-trust-strip-label">Coverage</span>
          <span className="ring1-trust-strip-value ring1-trust-strip-live">
            <span className="pro-live-dot" aria-hidden />
            24/7
          </span>
        </li>
        <li className="ring1-trust-strip-item">
          <span className="ring1-trust-strip-label">Owner alerts</span>
          <span className="ring1-trust-strip-value">&lt; 60s SMS</span>
        </li>
        <li className="ring1-trust-strip-item">
          <span className="ring1-trust-strip-label">Inbound</span>
          <span className="ring1-trust-strip-value">{line ?? "Not configured"}</span>
        </li>
        <li className="ring1-trust-strip-item">
          <span className="ring1-trust-strip-label">Lead capture</span>
          <span className="ring1-trust-strip-value">Automatic</span>
        </li>
      </ul>
    </div>
  );
}
