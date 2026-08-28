import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CheckoutButton } from "@/components/checkout-button";
import { EarlyAccessForm } from "@/components/early-access-form";
import {
  MarketingShell,
  ShellPageIntro,
  ShellVoidPanel,
} from "@/components/marketing-shell";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { company, pricing } from "@/lib/company";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Orvius design partner pilot — thirty days free. Then simple monthly pricing built for HVAC, plumbing, and electrical shops.",
};

function PricingCard({
  plan,
  featured = false,
  actions,
}: {
  plan: typeof pricing.pilot | typeof pricing.pro;
  featured?: boolean;
  actions?: ReactNode;
}) {
  const isPilot = plan.price === 0;

  return (
    <div
      className={`panel-void flex h-full flex-col p-6 md:p-8 ${
        featured
          ? "shadow-[0_0_0_1px_rgba(232,70,28,0.35),0_0_48px_rgba(232,70,28,0.08)]"
          : "shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{isPilot ? "Now open" : "After pilot"}</p>
          <h2 className="mt-3 font-serif text-2xl tracking-[-0.03em] text-chalk">
            {plan.name}
          </h2>
        </div>
        {isPilot && "limit" in plan ? (
          <span className="rounded-full border border-flare/30 bg-flare/10 px-3 py-1 font-sans text-[10px] font-bold tracking-[0.18em] text-flare uppercase">
            {plan.limit}
          </span>
        ) : null}
      </div>

      <div className="mt-6 flex items-baseline gap-2">
        {isPilot ? (
          <span className="font-serif text-5xl tracking-[-0.04em] text-chalk">
            Free
          </span>
        ) : (
          <>
            <span className="font-serif text-5xl tracking-[-0.04em] text-chalk">
              ${plan.price}
            </span>
            <span className="font-sans text-sm text-ash-soft">{plan.period}</span>
          </>
        )}
      </div>
      <p className="mt-2 font-sans text-sm text-ash-soft">
        {isPilot ? `${plan.period} · no credit card` : "Billed monthly · cancel anytime"}
      </p>

      <ul className="mt-8 flex-1 space-y-3 border-t border-white/10 pt-8">
        {plan.highlights.map((item) => (
          <li
            key={item}
            className="flex gap-3 font-sans text-sm leading-relaxed text-ash-soft"
          >
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-flare" />
            {item}
          </li>
        ))}
      </ul>

      {actions ?? (
        <Link
          href={plan.href}
          className={`btn mt-8 w-full justify-center ${
            featured ? "btn-on-void" : "btn-on-void-secondary"
          }`}
        >
          {plan.cta}
        </Link>
      )}
    </div>
  );
}

export default function PricingPage() {
  return (
    <MarketingShell headerPosition="sticky" cta={false} atmosphere>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-28 md:px-8 md:pt-32">
        <ShellPageIntro
          label="Pricing"
          title="Prove it free. Pay when it works."
          description={`${company.productName} is priced for owner-operators — one missed emergency call costs more than a month of service.`}
        />

        <RevealOnScroll className="mt-12 grid gap-6 lg:grid-cols-2 lg:gap-8">
          <PricingCard plan={pricing.pilot} featured />
          <PricingCard
            plan={pricing.pro}
            actions={
              <div className="mt-8 space-y-3">
                <Link
                  href="/pilot"
                  className="btn btn-on-void-secondary w-full justify-center"
                >
                  Start with free pilot
                </Link>
                <CheckoutButton label="Subscribe — $299/mo" />
                <p className="text-center font-sans text-[11px] leading-relaxed text-ash">
                  Subscribe after your pilot, or when you&apos;re ready to go live.
                </p>
              </div>
            }
          />
        </RevealOnScroll>

        <RevealOnScroll className="mt-16">
          <ShellVoidPanel className="p-6 md:p-10">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
              <div>
                <p className="eyebrow">ROI math</p>
                <h2 className="mt-4 font-serif text-2xl tracking-[-0.03em] text-chalk">
                  One booked job pays for the month.
                </h2>
                <p className="mt-4 font-sans text-sm leading-relaxed text-ash-soft">
                  A single after-hours AC repair or water-heater job often clears
                  ${pricing.pro.price}. {company.productName} exists so you never
                  lose that call to voicemail — or your competitor.
                </p>
                <ul className="mt-6 space-y-2 font-sans text-sm text-ash-soft">
                  <li>· Average missed-call cost: $500–$2,000+ in home services</li>
                  <li>· No per-minute surprise bills — flat monthly</li>
                  <li>· Invoices from {company.legalName}</li>
                </ul>
              </div>
              <div>
                <p className="eyebrow">Apply</p>
                <p className="mt-3 font-sans text-sm text-ash-soft">
                  Join the design partner pilot. We onboard you personally.
                </p>
                <div className="mt-6">
                  <EarlyAccessForm variant="full" />
                </div>
              </div>
            </div>
          </ShellVoidPanel>
        </RevealOnScroll>

        <RevealOnScroll className="mt-12">
          <div className="rounded-md border border-white/8 bg-white/3 px-5 py-4 font-sans text-xs leading-relaxed text-ash">
            <p>
              <strong className="text-chalk">Billing.</strong> Pilot is free for
              thirty days. After the pilot, {company.productName} Pro is $
              {pricing.pro.price}/month unless otherwise agreed in writing.
              Payments are processed by {company.legalName}. See{" "}
              <Link href="/terms" className="footer-link text-ash-soft">
                Terms of Service
              </Link>{" "}
              for full details.
            </p>
          </div>
        </RevealOnScroll>
      </main>
    </MarketingShell>
  );
}
