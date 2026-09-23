import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeCallStory } from "@/components/home-call-story";

export const dynamic = "force-dynamic";

/**
 * Company page — Hero (claim + live HVAC example) → shared loop / trades →
 * call story. Live line + call audit stay the only primary actions.
 */
export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero />
      <HomeStatement />
      <HomeCallStory />
    </MarketingShell>
  );
}
