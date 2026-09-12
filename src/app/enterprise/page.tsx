import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Multi-shop",
  description: `${company.productName} for multi-shop and franchise operators — dedicated lines per location, central billing, and one operating standard.`,
};

const pillars = [
  {
    id: "01",
    title: "One standard, every location.",
    body: "Dedicated shop lines per location — the same answer, booking, and alert loop. Today each shop is still a single-owner workspace; shared operator seats are design-partner scope, not self-serve RBAC.",
  },
  {
    id: "02",
    title: "Central billing, honest access.",
    body: "Consolidated billing and rollup reporting as the footprint proves out. Per-location dashboard roles are on the roadmap — not shipped as multi-user seats today.",
  },
  {
    id: "03",
    title: "Onboarding you can hand off.",
    body: "Custom onboarding, priority support, and quarterly reviews — with proof of recovered jobs and dollars per shop.",
  },
] as const;

export default function MultiShopPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Multi-shop"
            title="Multi-shop, one operating standard."
            subline="For franchises and operators running 2+ locations."
            description="For operators with 2+ locations. Start as a design partner — dedicated lines per shop, then volume pricing as the footprint proves out. Multi-user seats are not self-serve yet."
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
              href={`mailto:${company.contactEmail}?subject=Multi-shop%20design%20partner`}
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
