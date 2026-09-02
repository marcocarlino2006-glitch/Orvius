import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { EarlyAccessForm } from "@/components/early-access-form";
import { HomeCallDemo } from "@/components/home-call-demo";
import { company } from "@/lib/company";
import { demoLineHref } from "@/lib/demo-line";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Book a live call audit",
  description:
    "Book a live Orvius call audit — we review your after-hours and overflow pattern, then set up your shop line. HVAC, plumbing, and electrical.",
};

export default function PilotPage() {
  return (
    <MarketingShell cta={{ href: demoLineHref(), label: "Try the live line" }}>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Live call audit"
            title="See what your missed calls are costing."
            subline="We walk your after-hours and overflow pattern — then go live if it is a fit"
            description={`No slide deck. A real look at what Orvius would capture for your ${company.trades.join(" / ")} shop. 30 days free when you start.`}
          />
          <div className="tier1-hero-call">
            <HomeCallDemo variant="light" size="section" />
          </div>
          <div className="tier1-actions" style={{ marginTop: "1.5rem" }}>
            <a href="#waitlist" className="inst-btn inst-btn-primary">
              Request a call audit
            </a>
            <a href={demoLineHref()} className="inst-btn inst-btn-ghost">
              Try the live line
            </a>
          </div>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted" id="waitlist">
        <div className="editorial-wrap" style={{ maxWidth: "36rem" }}>
          <p className="tier1-eyebrow type-eyebrow">Request</p>
          <h2 className="tier1-section-title type-headline">
            Book the audit. We reply within a day.
          </h2>
          <p className="tier1-section-lead font-sans">
            Leave shop details. We schedule a short call, review after-hours
            traffic, and configure the line if you want to proceed.
          </p>
          <div className="tier1-form-slot" style={{ marginTop: "1.25rem" }}>
            <EarlyAccessForm variant="full" />
          </div>
          <p className="tier1-section-lead font-sans" style={{ marginTop: "1.5rem" }}>
            Prefer to start yourself?{" "}
            <Link href="/login" className="customer-timeline-link">
              Sign in and get a dedicated number →
            </Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
