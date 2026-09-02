import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { OsRings } from "@/components/os-rings";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: `${company.productName} — ${company.vision}`,
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Company"
            title={company.tagline}
            subline="The operating system for service businesses — starting at the front door."
            description={company.mission}
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap max-w-3xl">
          <p className="tier1-eyebrow type-eyebrow">Best possible outcome</p>
          <h2 className="tier1-section-title type-headline">Where we&apos;re going.</h2>
          <p className="tier1-section-lead font-sans">{company.vision}</p>
          <ul className="tier1-strategy-list font-sans">
            {company.strategy.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap">
          <p className="tier1-eyebrow type-eyebrow">What&apos;s live</p>
          <h2 className="tier1-section-title type-headline">One ring at a time.</h2>
          <p className="tier1-section-lead font-sans max-w-2xl">
            Built by {company.legalName} for {company.trades.join(", ")}. We
            ship what shops can use today — then expand when the loop is airtight.
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
