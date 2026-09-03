import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeWorkflow } from "@/components/home-workflow";
import { HomeCallStory } from "@/components/home-call-story";
import { HomeTrust } from "@/components/home-trust";
import { HomeOsPath, HomePlanTruth } from "@/components/home-os-path";
import { MktSection } from "@/components/mkt-section";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero />
      <HomeWorkflow />
      <HomeCallStory />
      <HomeTrust />
      <HomeOsPath />
      <HomePlanTruth />

      <MktSection tone="dark" className="mkt-close mkt-close--cinema">
        <div className="mkt-close-wash" aria-hidden />
        <div className="mkt-close-inner">
          <p className="mkt-close-kicker font-sans">Next step</p>
          <h2 className="mkt-close-title">See it on your shop&apos;s calls — not a slide deck.</h2>
          <p className="mkt-close-desc font-sans">
            Book a live call audit. We&apos;ll walk through real transcripts, jobs, and dispatch — then you
            decide if Orvius fits.
          </p>
          <div className="mkt-close-actions">
            <Link href="/pilot" className="mkt-btn mkt-btn-ink-light mkt-btn-lg mkt-btn-hero">
              Book a live call audit
            </Link>
            <a href="tel:+18446439170" className="mkt-close-call font-sans">
              Or call the live line →
            </a>
          </div>
        </div>
      </MktSection>
    </MarketingShell>
  );
}
