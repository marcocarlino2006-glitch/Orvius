import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { OsRings } from "@/components/os-rings";
import { company } from "@/lib/company";
import { workspaceAccessPublicClaim } from "@/lib/seats";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: `${company.productName} — ${company.categoryClaim} ${company.proofLine}`,
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label={company.productName}
            title={company.tagline}
            subline={company.proofLine}
            description={company.categoryClaim}
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap max-w-3xl">
          <h2 className="tier1-section-title type-headline">
            Missed and after-hours calls become booked work.
          </h2>
          <p className="tier1-section-lead font-sans">{company.mission}</p>
          <ul className="tier1-strategy-list font-sans">
            {company.strategy.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap max-w-3xl">
          <h2 className="tier1-section-title type-headline">
            For {company.trades.join(", ")}.
          </h2>
          <p className="tier1-section-lead font-sans">
            Built by {company.legalName}. We claim only what the line closes
            today — capture, qualify, alert, book — and expand the shop record
            when that loop is airtight.
          </p>
          <p className="tier1-section-lead font-sans">
            {workspaceAccessPublicClaim()}
          </p>
          <p className="tier1-section-lead font-sans">
            {company.vision}
          </p>
          <h2 className="tier1-section-title type-headline mt-10">
            Labelled honestly.
          </h2>
          <p className="tier1-section-lead font-sans max-w-2xl">
            Live means production paths. Beta means limited. Planned stays off
            the claim until the loop is airtight.
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
            <Link href="/pricing" className="inst-btn inst-btn-primary">
              View pricing
            </Link>
            <Link href="/pilot" className="inst-btn inst-btn-ghost">
              Book a live audit
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
