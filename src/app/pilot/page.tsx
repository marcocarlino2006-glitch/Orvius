import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { EarlyAccessForm } from "@/components/early-access-form";
import { HomeCallDemo } from "@/components/home-call-demo";
import { OwnerAlertCard } from "@/components/owner-alert-card";
import { company, pricing } from "@/lib/company";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design partner program",
  description:
    "Apply for the Orvius design partner program. Personal onboarding for HVAC, plumbing, and electrical shops.",
};

export default function PilotPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="tier1-hero-glow" aria-hidden />
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Design partner"
            title="Get your dedicated line."
            subline="30-day program · personal onboarding · no credit card"
            description="Call the live demo first. Then sign in or apply below."
          />
          <div className="tier1-hero-call">
            <HomeCallDemo variant="light" size="section" />
          </div>
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap tier1-story-grid">
          <div>
            <h2 className="tier1-section-title font-sans">What you get.</h2>
            <p className="tier1-section-lead font-sans">
              The front door of the OS — answering after hours, on weekends, and
              when you&apos;re mid-job.
            </p>
            <p className="mt-6 tier1-section-lead font-sans">
              Every lead qualified with service, urgency, address, and callback.
              Owner alerts via SMS and dashboard. Built for{" "}
              {company.trades.join(", ")}.
            </p>
          </div>
          <OwnerAlertCard variant="chalk" />
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap tier1-story-grid">
          <div className="panel-chalk p-6 md:p-8">
            <p className="tier1-eyebrow font-sans">Apply</p>
            <p className="tier1-card-title font-sans">Limited shops</p>
            <p className="tier1-section-lead font-sans">
              Sign in to provision your shop in minutes — dedicated local line,
              AI receptionist, and owner alerts. We onboard design partners
              personally when you need porting or custom setup.
            </p>
            <div className="mt-6">
              <EarlyAccessForm variant="full" />
            </div>
          </div>
          <div>
            <h2 className="tier1-section-title font-sans">How it works.</h2>
            <p className="tier1-section-lead font-sans">
              Apply below. We review each shop and reach out within 24 hours. If
              you&apos;re a fit, we configure your line together — then go live.
            </p>
            <p className="mt-6 tier1-section-lead font-sans">
              After the program, continue at ${pricing.pro.price}/month or walk
              away — no hard feelings.
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
