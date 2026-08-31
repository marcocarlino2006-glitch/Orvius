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
      <section className="marketing-hero">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Design partner"
            title="Get Orvius on your line this week."
            subline="30-day program · personal onboarding · no credit card"
            description="Call the live demo first if you want proof — then apply below."
          />
          <div className="marketing-hero-call">
            <HomeCallDemo variant="light" size="section" />
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="editorial-wrap marketing-split">
          <div>
            <h2 className="home-platform-title font-sans">What you get.</h2>
            <p className="home-platform-lead font-sans">
              The front door of the OS — answering after hours, on weekends, and
              when you&apos;re mid-job.
            </p>
            <p className="mt-6 home-platform-lead font-sans">
              Every lead qualified with service, urgency, address, and callback
              details. Owner alerts via SMS and dashboard.
            </p>
            <p className="mt-4 home-platform-lead font-sans">
              Built for {company.trades.join(", ")}.
            </p>
          </div>
          <OwnerAlertCard variant="chalk" className="editorial-card" />
        </div>
      </section>

      <section className="marketing-section marketing-section-muted">
        <div className="editorial-wrap marketing-split marketing-split-reverse">
          <div className="panel-chalk p-6 md:p-8">
            <p className="home-platform-kicker font-sans">Apply</p>
            <p className="mt-3 marketing-card-title font-sans">Limited shops</p>
            <p className="mt-2 home-platform-lead font-sans">
              We onboard you personally. Live on your number within days.
            </p>
            <div className="mt-6">
              <EarlyAccessForm variant="full" />
            </div>
          </div>
          <div>
            <h2 className="home-platform-title font-sans">How it works.</h2>
            <p className="home-platform-lead font-sans">
              Apply below. We review each shop and reach out within 24 hours. If
              you&apos;re a fit, we configure your line together — then go live.
            </p>
            <p className="mt-6 home-platform-lead font-sans">
              After the program, continue at ${pricing.pro.price}/month or walk
              away — no hard feelings.
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
