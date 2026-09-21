import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeCallStory } from "@/components/home-call-story";

export const dynamic = "force-dynamic";

/**
 * Company page — one composition, then doctrine, then proof.
 * No try-now pile. No stacked Call CTAs. Liveline is the path.
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
