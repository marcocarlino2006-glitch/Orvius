import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { EarlyAccessForm } from "@/components/early-access-form";
import { OwnerAlertCard } from "@/components/owner-alert-card";
import { company, pricing } from "@/lib/company";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free pilot",
  description:
    "First ten HVAC, plumbing, and electrical shops. Thirty days free. Orvius answers every call.",
};

export default function PilotPage() {
  return (
    <MarketingShell cta={false}>
      <section className="editorial-hero">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Free pilot"
            title="Get Orvius answering your calls this week."
            description="Ten home-service businesses. Thirty days free. We set it up with you — no credit card."
          />
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-wrap editorial-split">
          <div className="editorial-copy">
            <h2 className="editorial-heading font-serif">What you get.</h2>
            <p className="editorial-body font-sans">
              A full AI receptionist on your business line — answering after hours,
              on weekends, and when you&apos;re mid-job.
            </p>
            <p className="mt-6 font-sans text-[0.9375rem] leading-relaxed text-ash">
              Every lead qualified with service, urgency, address, and callback
              details. Owner alerts via SMS and dashboard — everything you need to
              close.
            </p>
            <p className="mt-4 font-sans text-[0.9375rem] leading-relaxed text-ash">
              Built for {company.trades.join(", ")}. Operated by{" "}
              {company.legalName}.
            </p>
          </div>
          <OwnerAlertCard variant="chalk" className="editorial-card" />
        </div>
      </section>

      <section className="editorial-section editorial-section-muted">
        <div className="editorial-wrap editorial-split editorial-split-reverse">
          <div className="panel-chalk p-6 md:p-8">
            <p className="font-sans text-[11px] font-bold tracking-[0.2em] text-ash uppercase">
              Apply now
            </p>
            <p className="mt-3 font-serif text-xl tracking-[-0.03em] text-void">
              First ten shops
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
              you&apos;re a fit, we configure your line, services, and hours
              together — then go live.
            </p>
            <p className="mt-6 font-sans text-[0.9375rem] leading-relaxed text-ash">
              Thirty days free. No credit card. After the pilot, continue at $
              {pricing.pro.price}/month or walk away — no hard feelings.
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
