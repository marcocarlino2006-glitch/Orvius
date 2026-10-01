import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeNight } from "@/components/home-night";
import { HomeReveal } from "@/components/home-reveal";
import { HomeRules } from "@/components/home-rules";
import { HomeReel } from "@/components/home-reel";
import { HomeCompare } from "@/components/home-compare";
import { HomeCallStory } from "@/components/home-call-story";
import "./home-sections.css";


/**
 * Hero → the product, drifting past → what every call gets → a night on the
 * line → your rules → compare → call close.
 */
export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero />
      <HomeReel />
      <HomeStatement />
      <HomeNight />
      <HomeRules />
      <HomeCompare />
      <HomeCallStory />
      <HomeReveal />
    </MarketingShell>
  );
}
