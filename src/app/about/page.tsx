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
      <section className="editorial-hero">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Company"
            title="The operating system for service businesses."
            subline="We start at the front door. One layer at a time."
            description={company.mission}
          />
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-wrap max-w-3xl">
          <p className="font-sans text-[0.9375rem] leading-relaxed text-ash">
            {company.productName} is developed and operated by{" "}
            {company.legalName}. We focus on {company.trades.join(", ")} — where
            missed calls become lost revenue.
          </p>
          <p className="mt-5 font-sans text-[0.9375rem] leading-relaxed text-ash">
            We started at the front door — answering and qualifying every call.
            Customer records followed. Jobs are live: a lead becomes a booked
            appointment, not a sticky note. Dispatch, billing, and everything
            else builds on that foundation. One layer at a time.
          </p>
        </div>
      </section>

      <section className="editorial-section editorial-section-muted">
        <div className="editorial-wrap">
          <h2 className="editorial-heading font-serif">The system.</h2>
          <p className="editorial-body font-sans max-w-2xl">
            Orvius expands in layers — each one a complete module, not a
            half-built feature. What&apos;s live today is what shops actually use.
          </p>
          <div className="mt-12">
            <OsRings />
          </div>
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-wrap editorial-split">
          <div className="editorial-copy">
            <h2 className="editorial-heading font-serif">{company.legalName}</h2>
            <p className="editorial-body font-sans">
              Contracts, invoices, and subscriptions are with {company.legalName}.
              {company.productName} is our product brand for service-business
              operators.
            </p>
          </div>
          <div className="editorial-actions font-sans">
            <Link href="/legal" className="editorial-link">
              Legal center →
            </Link>
            <Link href="/pricing" className="editorial-cta">
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
