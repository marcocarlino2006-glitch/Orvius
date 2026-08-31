import { HomeCallStory } from "@/components/home-call-story";
import { HomeCaseQuote } from "@/components/home-case-quote";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeProductStage } from "@/components/home-product-stage";
import { PublicLayout } from "@/components/marketing-shell";
import { demoLineHref } from "@/lib/demo-line";
import { pricing } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Call +1 844 643 9170 — hear Orvius on a live shop line",
  description:
    "Call the live demo. Orvius answers, qualifies, and alerts the owner in under 60 seconds. Built for HVAC, plumbing, and electrical shops.",
  openGraph: {
    title: "Call Orvius live — +1 844 643 9170",
    description:
      "Real line. Real receptionist. Call now and hear what your customers will hear.",
  },
};

export default function HomePage() {
  return (
    <PublicLayout showStickyCall>
      <HomeLineHero />

      <section className="shop-product" aria-label="Shop OS preview">
        <div className="editorial-wrap">
          <div className="shop-product-head">
            <h2 className="shop-product-title font-sans">
              The shop board — inbox, jobs, dispatch, ask
            </h2>
            <p className="shop-product-lead font-sans">
              Tap a tab. This is the same OS your crew runs from after the call
              lands.
            </p>
          </div>
          <HomeProductStage />
        </div>
      </section>

      <HomeCallStory />

      <HomeCaseQuote />

      <section className="shop-close">
        <div className="editorial-wrap shop-close-inner font-sans">
          <p className="shop-close-line-label">Your line could sound like this</p>
          <a href={demoLineHref()} className="shop-close-line">
            +1 844 643 9170
          </a>
          <div className="shop-hero-actions shop-close-actions">
            <a href={demoLineHref()} className="shop-hero-call">
              Call the demo
            </a>
            <Link href="/pilot" className="shop-hero-secondary">
              Put Orvius on my number
            </Link>
          </div>
          <p className="shop-close-foot">
            ${pricing.pro.price}/mo · no per-minute billing · cancel anytime
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
