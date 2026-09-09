import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Enterprise",
  description: `${company.productName} design-partner access for multi-shop and franchise operators evaluating one after-hours operating standard.`,
};

const pillars = [
  {
    id: "01",
    title: "Map the operating standard.",
    body: "Document each location's services, hours, escalation rules, call flow, and capacity before software starts making proposals.",
  },
  {
    id: "02",
    title: "Prove one location first.",
    body: "Start with one live line and measured captured-demand bookings. Expand only after the call, confirmation, and owner-alert loop is reliable.",
  },
  {
    id: "03",
    title: "Design the control plane together.",
    body: "Portfolio roles, consolidated billing, and cross-location reporting are design-partner requirements, not generally available product claims.",
  },
] as const;

export default function EnterprisePage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Enterprise"
            title="Build one standard before scaling every location."
            subline="A design-partner brief for franchises and multi-shop operators."
            description="Orvius is proving the autonomous front desk one live location at a time. The multi-location control plane is not generally available yet."
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap">
          <ol className="mkt-laws mkt-laws--meta font-sans">
            {pillars.map((c) => (
              <li key={c.id} className="mkt-law">
                <span className="mkt-law-id" aria-hidden>
                  {c.id}
                </span>
                <div className="mkt-law-copy">
                  <h2 className="mkt-law-title">{c.title}</h2>
                  <p className="mkt-law-body">{c.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap tier1-story-grid">
          <div>
            <h2 className="tier1-section-title type-headline">
              Talk through your footprint.
            </h2>
            <p className="tier1-section-lead font-sans">
              Multi-shop pricing is custom. Tell us how many locations you run
              and we&apos;ll set the standard up with you.
            </p>
          </div>
          <div className="tier1-actions">
            <a
              href="mailto:hello@orvius.im?subject=Enterprise%20%E2%80%94%20multi-shop"
              className="inst-btn inst-btn-ghost"
            >
              Contact sales
            </a>
            <Link href="/pricing" className="inst-btn inst-btn-primary">
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
