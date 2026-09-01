import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { OsRings } from "@/components/os-rings";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: `${company.productName} — ${company.tagline} A product of ${company.legalName}.`,
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Company"
            title="The operating system for service businesses."
            subline="We start at the front door. One layer at a time."
            description={company.mission}
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap max-w-3xl">
          <p className="tier1-section-lead font-sans">
            {company.productName} is developed and operated by{" "}
            {company.legalName}. We focus on {company.trades.join(", ")} — where
            missed calls become lost revenue.
          </p>
          <p className="tier1-section-lead font-sans">
            We started at the front door — answering and qualifying every call.
            Customer records followed. Jobs are live: a lead becomes a booked
            appointment, not a sticky note. Dispatch, billing, and everything
            else builds on that foundation. One layer at a time.
          </p>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap">
          <p className="tier1-eyebrow type-eyebrow">Platform</p>
          <h2 className="tier1-section-title type-headline">The system.</h2>
          <p className="tier1-section-lead font-sans max-w-2xl">
            Orvius expands in layers — each one a complete module, not a
            half-built feature. What&apos;s live today is what shops actually use.
          </p>
          <div className="tier1-rings">
            <OsRings />
          </div>
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap tier1-story-grid">
          <div>
            <h2 className="tier1-section-title type-headline">{company.legalName}</h2>
            <p className="tier1-section-lead font-sans">
              Contracts, invoices, and subscriptions are with {company.legalName}.
              {company.productName} is our product brand for service-business
              operators.
            </p>
          </div>
          <div className="tier1-actions">
            <Link href="/legal" className="inst-btn inst-btn-ghost">
              Legal center
            </Link>
            <Link href="/pricing" className="inst-btn inst-btn-primary">
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
