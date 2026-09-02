import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeWorkflow } from "@/components/home-workflow";
import { HomeCallStory } from "@/components/home-call-story";
import { HomeProof } from "@/components/home-proof";
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
      <HomeProof />
      <HomeTrust />
      <HomeOsPath />
      <HomePlanTruth />

      <MktSection tone="dark" className="mkt-close">
        <div className="mkt-close-inner">
          <h2 className="mkt-close-title">See it on your shop’s calls — not a slide deck.</h2>
          <p className="mkt-close-desc">
            Book a live call audit. We’ll walk through real transcripts, jobs, and dispatch — then you decide if
            Orvius fits.
          </p>
          <div className="mkt-close-actions">
            <Link href="/pilot" className="mkt-btn mkt-btn-primary mkt-btn-lg">
              Book a live call audit
            </Link>
            <Link href="/signup" className="mkt-btn mkt-btn-ghost-light mkt-btn-lg">
              Start free signup
            </Link>
          </div>
        </div>
      </MktSection>
    </MarketingShell>
  );
}
