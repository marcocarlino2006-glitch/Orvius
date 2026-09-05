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
        <div className="mkt-close-inner">
          <h2 className="mkt-close-title">See it on your calls.</h2>
          <p className="mkt-close-desc font-sans">
            A live audit on real transcripts and jobs — then you decide.
          </p>
          <div className="mkt-close-actions">
            <Link href="/pilot" className="mkt-btn mkt-btn-chalk mkt-btn-lg">
              Book a live call audit
            </Link>
            <a href="tel:+18446439170" className="mkt-close-call font-sans">
              Or call the live line
            </a>
          </div>
        </div>
      </MktSection>
    </MarketingShell>
  );
}
