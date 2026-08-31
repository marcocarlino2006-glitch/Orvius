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
      <section className="marketing-hero">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Company"
            title="The operating system for service businesses."
            subline="We start at the front door. One layer at a time."
            description={company.mission}
          />
        </div>
      </section>

      <section className="marketing-section">
        <div className="editorial-wrap max-w-3xl">
          <p className="home-platform-lead font-sans">
            {company.productName} is developed and operated by{" "}
            {company.legalName}. We focus on {company.trades.join(", ")} — where
            missed calls become lost revenue.
          </p>
          <p className="mt-5 home-platform-lead font-sans">
            We started at the front door — answering and qualifying every call.
            Customer records followed. Jobs are live: a lead becomes a booked
            appointment, not a sticky note. Dispatch, billing, and everything
            else builds on that foundation. One layer at a time.
          </p>
        </div>
      </section>

      <section className="marketing-section marketing-section-muted">
        <div className="editorial-wrap">
          <h2 className="home-platform-title font-sans">The system.</h2>
          <p className="home-platform-lead font-sans max-w-2xl">
            Orvius expands in layers — each one a complete module, not a
            half-built feature. What&apos;s live today is what shops actually use.
          </p>
          <div className="mt-12">
            <OsRings />
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="editorial-wrap marketing-split">
          <div>
            <h2 className="home-platform-title font-sans">{company.legalName}</h2>
            <p className="home-platform-lead font-sans">
              Contracts, invoices, and subscriptions are with {company.legalName}.
              {company.productName} is our product brand for service-business
              operators.
            </p>
          </div>
          <div className="marketing-actions font-sans">
            <Link href="/legal" className="home-platform-link">
              Legal center →
            </Link>
            <Link href="/pricing" className="tier-btn tier-btn-primary">
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
