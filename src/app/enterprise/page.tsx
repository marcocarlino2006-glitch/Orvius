import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Multi-shop",
  description: `${company.productName} for operators with 2+ shops — design-partner rollout, dedicated lines, and a shared operating standard. Volume pricing is custom.`,
};

const pillars = [
  {
    id: "01",
    title: "Same night shift, every location.",
    body: "Each shop gets its own line on one Orvius workspace — answer, book, and alert loops stay consistent as you add locations.",
  },
  {
    id: "02",
    title: "Billing that matches the footprint.",
    body: "Multi-shop pricing is custom today. We consolidate invoices and roles as you grow — not a self-serve enterprise suite yet.",
  },
  {
    id: "03",
    title: "Onboarding you can hand off.",
    body: "Design-partner onboarding and priority support while we prove recovered jobs and dollars per shop.",
  },
] as const;

export default function EnterprisePage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Multi-shop"
            title="Multi-shop, one night-shift standard."
            subline="For franchises and operators running 2+ locations."
            description="For operators running 2+ locations. Start as a design partner — dedicated lines per shop, then volume pricing as the footprint proves out."
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
              Multi-shop is not self-serve yet. Tell us how many locations you run
              and we&apos;ll design the rollout with you.
            </p>
          </div>
          <div className="tier1-actions">
            <a
              href="mailto:hello@orvius.im?subject=Multi-shop%20%E2%80%94%20design%20partner"
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
