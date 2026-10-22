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
 * Hero (category line beside the live call) → what every call gets → one row per idea
 * with the real screen → industries → compare → call close.
 */

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero signupOpen={getPublicLaunchReadiness().ready} />
      <section className="tier1-story ov-claim-band" aria-labelledby="home-claim-heading">
        <div className="editorial-wrap">
          <p className="tier1-eyebrow type-eyebrow">Start here</p>
          <h2 id="home-claim-heading" className="tier1-section-title type-headline">
            Claim your front door.
          </h2>
          <p className="tier1-section-lead font-sans">
            Put your shop&apos;s name on the line that answers when you can&apos;t. Hear it answer as your business,
            share the call, and turn the same name into your live line when you&apos;re ready.
          </p>
          <div style={{ marginTop: "1.5rem", maxWidth: "36rem" }}>
            <ClaimFrontDoor compact />
          </div>
        </div>
      </section>
      <HomeStatement />
      <HomeFeatures />
      <HomeCompare />
      <HomeCallStory />
      <HomeReveal />
    </MarketingShell>
  );
}
