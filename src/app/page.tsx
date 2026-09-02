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

      <MktSection tone="dark" className="mkt-close">
        <div className="mkt-close-inner">
          <h2 className="mkt-close-title">Your calls. Not a slide deck.</h2>
          <p className="mkt-close-desc">
            Book a live audit on your after-hours traffic. Go or no-go — same day.
          </p>
          <Link href="/pilot" className="mkt-btn mkt-btn-signal mkt-btn-lg">
            Book a live call audit
          </Link>
        </div>
      </MktSection>
    </MarketingShell>
  );
}
