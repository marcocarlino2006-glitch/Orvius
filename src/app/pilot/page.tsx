import { MarketingShell } from "@/components/marketing-shell";
import { MktSection } from "@/components/mkt-section";
import { EarlyAccessForm } from "@/components/early-access-form";
import { company } from "@/lib/company";
import { demoLineHref, DEMO_LINE_DISPLAY } from "@/lib/demo-line";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Book a live call audit",
  description:
    "Book a live Orvius call audit — we review your after-hours and overflow pattern, then set up your shop line. HVAC, plumbing, and electrical.",
};

export default function PilotPage() {
  return (
    <MarketingShell>
      <section className="mkt-inner-hero" aria-labelledby="pilot-heading">
        <div className="mkt-inner-hero-copy">
          <p className="mkt-inner-brand">Live call audit</p>
          <h1 id="pilot-heading" className="mkt-inner-title">
            See what your missed calls are costing.
          </h1>
          <p className="mkt-inner-lead font-sans">
            We walk your after-hours and overflow pattern — then go live if it
            is a fit. No slide deck.
          </p>
          <div className="mkt-close-actions">
            <a href="#waitlist" className="ov-btn ov-btn--solid">
              Request a call audit
            </a>
            <a href={demoLineHref()} className="ov-btn ov-btn--quiet">
              Call {DEMO_LINE_DISPLAY}
            </a>
          </div>
        </div>
      </section>

      <MktSection tone="light" aria-labelledby="waitlist-heading" id="waitlist">
        <div className="mkt-inner-block mkt-inner-block--form">
          <h2 id="waitlist-heading" className="mkt-inner-section-title">
            Book the audit. We&apos;ll email to schedule.
          </h2>
          <p className="mkt-inner-body font-sans">
            Leave shop details for a short call on your{" "}
            {company.trades.join(" / ")} after-hours traffic.
          </p>
          <div className="mkt-form-slot">
            <EarlyAccessForm variant="full" />
          </div>
          <p className="mkt-inner-note font-sans">
            Already invited?{" "}
            <Link href="/signin" className="underline underline-offset-2">
              Sign in and get a dedicated number
            </Link>
          </p>
        </div>
      </MktSection>
    </MarketingShell>
  );
}
