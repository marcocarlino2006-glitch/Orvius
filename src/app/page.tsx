import { HomeCallStory } from "@/components/home-call-story";
import { HomeLineHero } from "@/components/home-line-hero";
import { PublicLayout } from "@/components/marketing-shell";
import { getLowestPaidPrice } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orvius — Every call answered. Every lead owned.",
  description:
    "Call +1 844 643 9170 for the live demo. Orvius answers, qualifies, and alerts the owner. Pro adds jobs, dispatch, and Ask. Built for HVAC, plumbing, and electrical.",
  openGraph: {
    title: "Orvius — Call the live demo",
    description:
      "Live demo line. AI receptionist, qualified leads, owner alerts — for the trades.",
  },
};

export default function HomePage() {
  return (
    <PublicLayout>
      <HomeLineHero />

      <HomeCallStory />

      <section className="tier1-close">
        <div className="editorial-wrap tier1-close-inner">
          <p className="tier1-eyebrow type-eyebrow">Get started</p>
          <h2 className="tier1-section-title type-headline">
            Your line. Your shop. Live in minutes.
          </h2>
          <p className="tier1-section-lead font-sans">
            Sign in, name the shop, get a dedicated number. 30 days free — no card.
          </p>
          <div className="tier1-actions tier1-close-actions">
            <Link href="/login" className="inst-btn inst-btn-primary">
              Start free
            </Link>
            <Link href="/pricing" className="inst-btn inst-btn-ghost">
              View pricing
            </Link>
          </div>
          <p className="tier1-close-foot font-sans">
            From ${getLowestPaidPrice("year")}/mo · cancel anytime
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
