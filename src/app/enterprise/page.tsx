import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Enterprise",
  description: `${company.productName} for multi-shop and franchise operators — dedicated lines per location, central billing, and one operating standard.`,
};

const pillars = [
  {
    id: "01",
    title: "One standard, every location.",
    body: "Dedicated shop lines per location on one workspace — the same answer, booking, and alert loop across the whole footprint.",
  },
  {
    id: "02",
    title: "Central billing and admin.",
    body: "Consolidated billing, per-location roles, and rollup reporting. Volume pricing as you add shops.",
  },
  {
    id: "03",
    title: "Onboarding you can hand off.",
    body: "Custom onboarding, priority support, and quarterly reviews — with measured captured-demand bookings and recorded payments per shop.",
  },
] as const;

export default function EnterprisePage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Enterprise"
            title="Multi-shop, one operating standard."
            subline="For franchises and operators running 2+ locations."
            description="Run every shop on the same night-shift OS — dedicated lines per location, central billing, and measurable proof across the footprint."
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
                  <h3 className="mkt-law-title">{c.title}</h3>
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
