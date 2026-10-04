import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { EarlyAccessForm } from "@/components/early-access-form";
import { HomeCallDemo } from "@/components/home-call-demo";
import { demoLineHref } from "@/lib/demo-line";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Book a live call audit",
  description:
    "Book a live Orvius call audit — we review your after-hours and overflow pattern, then set up your shop line.",
};

export default function PilotPage() {
  return (
    <MarketingShell cta={{ href: demoLineHref(), label: "Try the live line" }}>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Live call audit"
            title="See what your missed calls are costing."
            subline="We walk through your after-hours and overflow calls, then set up your line if it fits."
            description="No slide deck. A look at what Orvius would capture for your business. If it fits, we set up your line with you and you choose a plan."
            actions={
              <>
                <a href="#waitlist" className="ov-btn ov-btn--solid">
                  Book a call audit
                </a>
                <a href={demoLineHref()} className="ov-btn ov-btn--quiet">
                  Call the live line
                </a>
              </>
            }
          />
          <div className="tier1-hero-call">
            <HomeCallDemo />
          </div>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted" id="waitlist">
        <div className="editorial-wrap" style={{ maxWidth: "36rem" }}>
          <p className="tier1-eyebrow type-eyebrow">Request</p>
          <h2 className="tier1-section-title type-headline">
            Book the audit. We&apos;ll email to schedule.
          </h2>
          <p className="tier1-section-lead font-sans">
            Leave shop details. We schedule a short call, review after-hours
            traffic, and configure the line if you want to proceed.
          </p>
          <div className="tier1-form-slot" style={{ marginTop: "1.25rem" }}>
            <EarlyAccessForm variant="full" />
          </div>
          <p className="tier1-section-lead font-sans" style={{ marginTop: "1.5rem" }}>
            Already invited to onboard?{" "}
            <Link href="/signin" className="customer-timeline-link">
              Sign in and get a dedicated number →
            </Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
