import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeCallStory } from "@/components/home-call-story";

export const dynamic = "force-dynamic";

/**
 * Same beats as baseline — try-now pile removed (Cursor: one proof path).
 * Hero → night rules → call story.
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
