import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeNight } from "@/components/home-night";
import { HomeReveal } from "@/components/home-reveal";
import { HomeRules } from "@/components/home-rules";
import { HomeSurfaces } from "@/components/home-surfaces";
import { HomeCompare } from "@/components/home-compare";
import { HomeStart } from "@/components/home-start";
import { HomeCallStory } from "@/components/home-call-story";
import "./home-sections.css";


/**
 * Hero → what every call gets → a night on the line → your rules →
 * product screens → compare → start here → call close.
 */
export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero />
      <HomeStatement />
      <HomeNight />
      <HomeRules />
      <HomeSurfaces />
      <HomeCompare />
      <HomeStart />
      <HomeCallStory />
      <HomeReveal />
    </MarketingShell>
  );
}
