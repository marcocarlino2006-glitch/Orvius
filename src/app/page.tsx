import { HomeCallStory } from "@/components/home-call-story";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeOsPath } from "@/components/home-os-path";
import { HomePlanTruth } from "@/components/home-plan-truth";
import { HomeProof } from "@/components/home-proof";
import { HomeTrust } from "@/components/home-trust";
import { HomeWorkflow } from "@/components/home-workflow";
import { PublicLayout } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import { demoLineHref } from "@/lib/demo-line";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orvius — Turn missed calls into booked jobs",
  description:
    "Orvius answers after-hours and overflow calls for HVAC, plumbing, and electrical — qualifies, books, alerts the owner, and runs the shop from one system. Call the live line or book a call audit.",
  openGraph: {
    title: "Orvius — Turn missed calls into booked jobs",
    description:
      "Try the live line. Book a call audit. Front door today — operating system as you grow.",
  },
};

export default function HomePage() {
  return (
    <PublicLayout
      showStickyCall
      cta={{ href: "/pilot", label: "Book a call audit" }}
    >
      <HomeLineHero />

      <HomeWorkflow />

      <HomeCallStory />

      <HomeOsPath />

      <HomeProof />

      <HomeTrust />

      <HomePlanTruth />

      <section className="tier1-close home-close">
        <div className="editorial-wrap tier1-close-inner">
          <p className="tier1-eyebrow type-eyebrow">Next step</p>
          <h2 className="tier1-section-title type-headline">
            Hear the line. Then audit yours.
          </h2>
          <p className="tier1-section-lead font-sans">
            One primary action: book a live call audit. Or try the live{" "}
            {company.productName} line first — no form required.
          </p>
          <div className="tier1-actions tier1-close-actions">
            <Link href="/pilot" className="inst-btn inst-btn-primary">
              Book a live call audit
            </Link>
            <a href={demoLineHref()} className="inst-btn inst-btn-ghost">
              Try the live line
            </a>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
