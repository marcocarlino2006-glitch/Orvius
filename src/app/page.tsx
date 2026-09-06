import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeCallStory } from "@/components/home-call-story";
import { MktSection } from "@/components/mkt-section";
import { company } from "@/lib/company";

export const dynamic = "force-dynamic";

/**
 * Company page — not a SaaS landing stack.
 * Four beats: live line → night rules → proof → ask.
 */
export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero />
      <HomeStatement />
      <HomeCallStory />

      <MktSection tone="dark" className="mkt-close mkt-close--cinema mkt-close--institution">
        <div className="mkt-close-inner mkt-close-inner--institution">
          <p className="mkt-close-entity font-sans">{company.legalName}</p>
          <h2 className="mkt-close-title">
            Be the shop that never misses the night.
          </h2>
          <p className="mkt-close-desc font-sans">
            Not another AI receptionist bolted onto a CRM. The night shift for
            HVAC, plumbing, and electrical — prove it on your line, or call ours.
          </p>
          <div className="mkt-close-actions mkt-close-actions--institution">
            <Link href="/pilot" className="mkt-btn mkt-btn-chalk mkt-btn-lg">
              Prove it on your line
            </Link>
            <a href="tel:+18446439170" className="mkt-close-call font-sans">
              Call the live line
            </a>
          </div>
          <p className="mkt-close-claim font-sans">{company.categoryClaim}</p>
        </div>
      </MktSection>
    </MarketingShell>
  );
}
