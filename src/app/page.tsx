import { HomeCallStory } from "@/components/home-call-story";
import { HomeCaseQuote } from "@/components/home-case-quote";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeProductStage } from "@/components/home-product-stage";
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

      <section className="tier1-product" aria-label="Orvius platform">
        <div className="tier1-product-glow" aria-hidden />
        <div className="editorial-wrap tier1-product-inner">
          <div className="tier1-product-head">
            <p className="tier1-eyebrow tier1-eyebrow-light font-sans">Platform</p>
            <h2 className="tier1-section-title tier1-section-title-light font-sans">
              Inbox, jobs, dispatch, ask — one system of record.
            </h2>
            <p className="tier1-section-lead tier1-section-lead-light font-sans">
              Every ring writes to the same customer and job history. Sign in to
              set up your shop — dedicated line, AI receptionist, and command
              center included.
            </p>
          </div>
          <HomeProductStage />
        </div>
      </section>

      <HomeCallStory />

      <HomeCaseQuote />

      <section className="tier1-close">
        <div className="editorial-wrap tier1-close-inner font-sans">
          <p className="tier1-eyebrow">Ready when you are</p>
          <a href={demoLineHref()} className="tier1-close-line">
            {DEMO_LINE_DISPLAY}
          </a>
          <div className="tier1-actions tier1-close-actions">
            <a href={demoLineHref()} className="inst-btn inst-btn-primary">
              Call the demo
            </a>
            <Link href="/pilot" className="inst-btn inst-btn-ghost">
              Design partner program
            </Link>
            <Link href="/login" className="inst-btn inst-btn-ghost">
              Get started
            </Link>
          </div>
          <p className="tier1-close-foot">
            From ${getLowestPaidPrice()}/mo · cancel anytime
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
