import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { EarlyAccessForm } from "@/components/early-access-form";
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
      <section className="premium-pricing-hero">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Design partner"
            title="Get Orvius on your line this week."
            subline="30-day program · personal onboarding · no credit card"
            description="We configure your line, services, and hours together — then go live."
          />
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-wrap editorial-split">
          <div className="editorial-copy">
            <h2 className="editorial-heading font-serif">What you get.</h2>
            <p className="editorial-body font-sans">
              The front door of the OS — answering after hours, on weekends, and
              when you&apos;re mid-job.
            </p>
            <p className="mt-6 font-sans text-[0.9375rem] leading-relaxed text-ash">
              Every lead qualified with service, urgency, address, and callback
              details. Owner alerts via SMS and dashboard.
            </p>
            <p className="mt-4 font-sans text-[0.9375rem] leading-relaxed text-ash">
              Built for {company.trades.join(", ")}.
            </p>
          </div>
          <OwnerAlertCard variant="chalk" className="editorial-card" />
        </div>
      </section>

      <section className="editorial-section editorial-section-muted">
        <div className="editorial-wrap editorial-split editorial-split-reverse">
          <div className="panel-chalk p-6 md:p-8">
            <p className="home-os-kicker">Apply</p>
            <p className="mt-3 font-serif text-xl tracking-[-0.03em] text-void">
              Limited shops
            </p>
            <p className="mt-2 font-sans text-sm leading-relaxed text-ash">
              We onboard you personally. Live on your number within days.
            </p>
            <div className="mt-6">
              <EarlyAccessForm variant="full" />
            </div>
          </div>
          <div className="editorial-copy">
            <h2 className="editorial-heading font-serif">How it works.</h2>
            <p className="editorial-body font-sans">
              Apply below. We review each shop and reach out within 24 hours. If
              you&apos;re a fit, we configure your line together — then go live.
            </p>
            <p className="mt-6 font-sans text-[0.9375rem] leading-relaxed text-ash">
              After the program, continue at ${pricing.pro.price}/month or walk
              away — no hard feelings.
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
