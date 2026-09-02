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
            title={company.tagline}
            subline="We start at the front door. Ship what shops use."
            description={company.mission}
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap max-w-3xl">
          <p className="tier1-section-lead font-sans">
            {company.productName} is built by {company.legalName} for{" "}
            {company.trades.join(", ")} shops — where a missed call is lost
            revenue.
          </p>
          <p className="tier1-section-lead font-sans">
            Live today: answer and qualify every call, owner alerts, customers,
            jobs, and dispatch. Money and marketplace come after those loops are
            airtight.
          </p>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap">
          <p className="tier1-eyebrow type-eyebrow">What&apos;s live</p>
          <h2 className="tier1-section-title type-headline">The system.</h2>
          <p className="tier1-section-lead font-sans max-w-2xl">
            Only layers shops can use now. No roadmap theater.
          </p>
          <div className="tier1-rings">
            <OsRings liveOnly />
          </div>
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap tier1-story-grid">
          <div>
            <h2 className="tier1-section-title type-headline">{company.legalName}</h2>
            <p className="tier1-section-lead font-sans">
              Contracts and subscriptions are with {company.legalName}.{" "}
              {company.productName} is the product brand.
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
