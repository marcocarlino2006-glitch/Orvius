import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeCapabilities } from "@/components/home-capabilities";
import { HomeSurfaces } from "@/components/home-surfaces";
import { HomeCompare } from "@/components/home-compare";
import { HomeStart } from "@/components/home-start";
import { HomeCallStory } from "@/components/home-call-story";
import "./home-sections.css";

export const dynamic = "force-dynamic";

/**
 * Hero → night rules → capabilities → product surfaces → compare → start here → call close.
 */
export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero />
      <HomeStatement />
      <HomeCapabilities />
      <HomeSurfaces />
      <HomeCompare />
      <HomeStart />
      <HomeCallStory />
    </MarketingShell>
  );
}
