import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { EarlyAccessForm } from "@/components/early-access-form";
import { HomeCallDemo } from "@/components/home-call-demo";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Start free",
  description:
    "Start Orvius free — dedicated shop line, AI receptionist, owner alerts. HVAC, plumbing, and electrical.",
};

export default function PilotPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Start free"
            title="Your line. Live in minutes."
            subline="30 days free · no credit card · personal help when you need it"
            description={`Sign in, name the shop, get a dedicated number. Built for ${company.trades.join(", ")}.`}
          />
          <div className="tier1-hero-call">
            <HomeCallDemo variant="light" size="section" />
          </div>
          <div className="tier1-actions" style={{ marginTop: "1.5rem" }}>
            <Link href="/login" className="inst-btn inst-btn-primary">
              Sign in to start
            </Link>
            <a href="#waitlist" className="inst-btn inst-btn-ghost">
              Prefer we set it up
            </a>
          </div>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted" id="waitlist">
        <div className="editorial-wrap" style={{ maxWidth: "36rem" }}>
          <p className="tier1-eyebrow type-eyebrow">Or we onboard you</p>
          <h2 className="tier1-section-title type-headline">
            Need porting or custom setup?
          </h2>
          <p className="tier1-section-lead font-sans">
            Leave your shop details. We reach out within a day and configure the
            line with you.
          </p>
          <div className="tier1-form-slot" style={{ marginTop: "1.25rem" }}>
            <EarlyAccessForm variant="full" />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
