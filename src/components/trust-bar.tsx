import Link from "next/link";
import { trustBadges } from "@/lib/trust";

export function TrustBar() {
  return (
    <section className="trust-bar" aria-label="Trust and security">
      <div className="editorial-wrap">
        <ul className="trust-bar-grid">
          {trustBadges.map((badge) => (
            <li key={badge.label} className="trust-bar-item">
              <span className="trust-bar-dot" aria-hidden />
              <div>
                <p className="trust-bar-label font-sans">{badge.label}</p>
                <p className="trust-bar-detail font-sans">{badge.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="trust-bar-foot font-sans">
          Built for shops that need reliability from day one.{" "}
          <Link href="/security" className="editorial-link editorial-link-inline">
            Security →
          </Link>
        </p>
      </div>
    </section>
  );
}
