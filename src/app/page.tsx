import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeReveal } from "@/components/home-reveal";
import { HomeFeatures } from "@/components/home-features";
import { HomeCompare } from "@/components/home-compare";
import { HomeCallStory } from "@/components/home-call-story";
import { ClaimFrontDoor } from "@/components/claim-front-door";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";
import "./home-sections.css";


/**
 * Hero (the night-shift line beside the booked call) → what every call gets →
 * the day, one idea and one screen at a time → claim → compare → the number.
 */

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero signupOpen={getPublicLaunchReadiness().ready} />
      <HomeStatement />
      <HomeFeatures />
      <section className="tier1-story ov-claim-band" aria-labelledby="home-claim-heading">
        <div className="editorial-wrap">
          <h2 id="home-claim-heading" className="tier1-section-title type-headline">
            Claim your front door.
          </h2>
          <p className="tier1-section-lead font-sans">
            Hear it answer as your shop. Then turn that name into your line.
          </p>
          <div style={{ marginTop: "1.5rem", maxWidth: "36rem" }}>
            <ClaimFrontDoor compact />
          </div>
        </div>
      </section>
      <HomeCompare />
      <HomeCallStory />
      <HomeReveal />
    </MarketingShell>
  );
}
