import Link from "next/link";
import type { Metadata } from "next";
import { CheckoutButton } from "@/components/checkout-button";
import { EarlyAccessForm } from "@/components/early-access-form";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company, pricing } from "@/lib/company";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Orvius design partner pilot — thirty days free. Then simple monthly pricing built for HVAC, plumbing, and electrical shops.",
};

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="editorial-hero">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Pricing"
            title="Prove it free. Pay when it works."
            subline={`${company.productName} — one missed emergency call costs more than a month.`}
            description="Built for owner-operators running 2–15 trucks. Not ServiceTitan. Not bolt-on AI."
          />
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-wrap editorial-split">
          <div className="editorial-copy">
            <p className="home-os-kicker">Design partner pilot</p>
            <h2 className="editorial-heading font-serif">Thirty days free.</h2>
            <p className="editorial-body font-sans">
              We onboard you personally. Your line goes live within days — front
              door, inbox, jobs, and owner alerts. No credit card required.
            </p>
            <ul className="mt-6 space-y-2 font-sans text-[0.9375rem] leading-relaxed text-ash">
              {pricing.pilot.highlights.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
            <div className="mt-8">
              <Link href="/pilot" className="editorial-cta">
                Apply for free pilot
              </Link>
            </div>
          </div>

          <div className="editorial-copy">
            <p className="home-os-kicker">After pilot</p>
            <h2 className="editorial-heading font-serif">
              ${pricing.pro.price} per month.
            </h2>
            <p className="editorial-body font-sans">
              Flat monthly billing. Cancel anytime. Invoices from{" "}
              {company.legalName}.
            </p>
            <ul className="mt-6 space-y-2 font-sans text-[0.9375rem] leading-relaxed text-ash">
              {pricing.pro.highlights.map((item) => (
                <li key={item}>· {item}</li>
              ))}
            </ul>
            <div className="mt-8 space-y-3">
              <CheckoutButton label={`Subscribe — $${pricing.pro.price}/mo`} variant="primary" />
              <p className="font-sans text-xs leading-relaxed text-ash">
                Subscribe after your pilot, or when you&apos;re ready to go live.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="editorial-statement">
        <div className="editorial-wrap">
          <p className="editorial-quote font-serif">
            One booked job pays for the month.
          </p>
          <p className="editorial-quote-sub font-sans">
            A single after-hours AC repair or water-heater job often clears $
            {pricing.pro.price}. {company.productName} exists so you never lose that
            call to voicemail — or your competitor.
          </p>
        </div>
      </section>

      <section className="editorial-section editorial-section-muted">
        <div className="editorial-wrap editorial-split">
          <div className="editorial-copy">
            <h2 className="editorial-heading font-serif">Join the pilot.</h2>
            <p className="editorial-body font-sans">
              Limited availability. We work with each shop directly — not a
              self-serve signup flow.
            </p>
          </div>
          <div className="panel-chalk p-6 md:p-8">
            <EarlyAccessForm variant="full" />
          </div>
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-wrap">
          <p className="max-w-3xl font-sans text-xs leading-relaxed text-ash">
            <strong className="font-semibold text-void">Billing.</strong> Pilot is
            free for thirty days. After the pilot, {company.productName} Pro is $
            {pricing.pro.price}/month unless otherwise agreed in writing. Payments
            are processed by {company.legalName}. See{" "}
            <Link href="/terms" className="editorial-link">
              Terms of Service
            </Link>{" "}
            for full details.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
