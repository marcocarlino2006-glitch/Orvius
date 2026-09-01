import { HomeCallStory } from "@/components/home-call-story";
import { HomeCaseQuote } from "@/components/home-case-quote";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomePlatformGrid } from "@/components/home-platform-grid";
import { HomeTrustStrip } from "@/components/home-trust-strip";
import { PublicLayout } from "@/components/marketing-shell";
import { demoLineHref, DEMO_LINE_DISPLAY } from "@/lib/demo-line";
import { getLowestPaidPrice } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orvius — The operating system for service businesses",
  description:
    "Call +1 844 643 9170 for the live demo. Orvius answers, qualifies, and alerts the owner — inbox, jobs, dispatch, and Ask in one OS. Built for HVAC, plumbing, and electrical.",
  openGraph: {
    title: "Orvius — Call the live demo",
    description:
      "Live demo line. AI receptionist, qualified leads, owner alerts — one system of record for the trades.",
  },
};

export default function HomePage() {
  return (
    <PublicLayout showStickyCall>
      <HomeLineHero />
      <HomeTrustStrip />

      <section className="tier1-product inst-product" aria-label="Orvius platform">
        <div className="editorial-wrap tier1-product-inner">
          <div className="tier1-product-head">
            <p className="tier1-eyebrow tier1-eyebrow-light type-eyebrow">Platform</p>
            <h2 className="tier1-section-title tier1-section-title-light type-headline">
              One system of record for the shop.
            </h2>
            <p className="tier1-section-lead tier1-section-lead-light font-sans">
              Line, inbox, jobs, dispatch, and Ask — built for owner-operators
              who run on the phone, not generic CRM software.
            </p>
          </div>
          <HomePlatformGrid />
        </div>
      </section>

      <HomeCallStory />

      <HomeCaseQuote />

      <section className="tier1-close inst-close">
        <div className="editorial-wrap tier1-close-inner">
          <p className="tier1-eyebrow tier1-eyebrow-light type-eyebrow">Ready when you are</p>
          <a href={demoLineHref()} className="tier1-close-line type-phone">
            {DEMO_LINE_DISPLAY}
          </a>
          <div className="tier1-actions tier1-close-actions">
            <a href={demoLineHref()} className="inst-btn inst-btn-light">
              Call the demo
            </a>
            <Link href="/login" className="inst-btn inst-btn-outline-light">
              Get started
            </Link>
          </div>
          <p className="tier1-close-foot tier1-close-foot-light font-sans">
            From ${getLowestPaidPrice()}/mo · cancel anytime
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
