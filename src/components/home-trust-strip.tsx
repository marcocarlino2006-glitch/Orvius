import { company } from "@/lib/company";

export function HomeTrustStrip() {
  return (
    <div className="inst-trust-strip font-sans" role="contentinfo">
      <p className="inst-trust-strip-item">
        <span className="inst-trust-strip-label">Trades</span>
        {company.trades.join(" · ")}
      </p>
      <p className="inst-trust-strip-item">
        <span className="inst-trust-strip-label">Operator</span>
        {company.legalName}
      </p>
      <p className="inst-trust-strip-item">
        <span className="inst-trust-strip-label">Support</span>
        {company.supportEmail}
      </p>
    </div>
  );
}
