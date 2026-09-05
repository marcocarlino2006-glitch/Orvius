import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeWorkflow } from "@/components/home-workflow";
import { HomeCallStory } from "@/components/home-call-story";
import { HomeTrust } from "@/components/home-trust";
import { HomeOsPath, HomePlanTruth } from "@/components/home-os-path";
import { MktSection } from "@/components/mkt-section";
import { company } from "@/lib/company";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero />
      <HomeStatement />
      <HomeWorkflow />
      <HomeCallStory />
      <HomeTrust />
      <HomeOsPath />
      <HomePlanTruth />

      <MktSection tone="dark" className="mkt-close mkt-close--cinema">
        <div className="mkt-close-inner">
          <h2 className="mkt-close-title">Prove the first law on your line.</h2>
          <p className="mkt-close-desc font-sans">
            A live audit on real transcripts and jobs — then decide if Orvius
            becomes the OS your shop runs on.
          </p>
          <div className="mkt-close-actions">
            <Link href="/pilot" className="mkt-btn mkt-btn-chalk mkt-btn-lg">
              Book a live call audit
            </Link>
            <a href="tel:+18446439170" className="mkt-close-call font-sans">
              Or call the live line
            </a>
          </div>
          <p className="mkt-close-claim font-sans">{company.categoryClaim}</p>
        </div>
      </MktSection>
    </MarketingShell>
  );
}
