import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeToolShowcase } from "@/components/home-tool-showcase";
import { HomeStatement } from "@/components/home-statement";
import { HomeCallStory } from "@/components/home-call-story";

export const dynamic = "force-dynamic";

/**
 * Company page — not a SaaS landing stack.
 * Four beats: live line → night rules → proof → ask.
 */
export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero />
      <HomeToolShowcase />
      <HomeStatement />
      <HomeCallStory />

      <section className="mkt-trynow" aria-labelledby="home-trynow-heading">
        <div className="mkt-trynow-inner">
          <h2
            id="home-trynow-heading"
            className="mkt-trynow-title"
            data-i18n="trynow.title"
          >
            Try Orvius now.
          </h2>
          <div className="mkt-trynow-actions font-sans">
            <a
              href="tel:+18446439170"
              className="inst-btn inst-btn-primary mkt-trynow-cta"
              data-i18n="trynow.cta"
            >
              Call the live AI →
            </a>
          </div>
          <Link
            href="/pilot"
            className="mkt-trynow-call font-sans"
            data-i18n="trynow.call"
          >
            or book a live call audit
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
