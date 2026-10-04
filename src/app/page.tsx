import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeReveal } from "@/components/home-reveal";
import { HomeFeatures } from "@/components/home-features";
import { HomeCompare } from "@/components/home-compare";
import { HomeCallStory } from "@/components/home-call-story";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";
import "./home-sections.css";


/**
 * Hero (live call on a painting) → what every call gets → one row per idea
 * with the real screen → industries → compare → call close.
 */
export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero signupOpen={getPublicLaunchReadiness().ready} />
      <HomeStatement />
      <HomeFeatures />
      <HomeCompare />
      <HomeCallStory />
      <HomeReveal />
    </MarketingShell>
  );
}
