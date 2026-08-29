import {
  MarketingShell,
  ShellPageIntro,
  ShellVoidPanel,
} from "@/components/marketing-shell";
import { OsRings } from "@/components/os-rings";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: `${company.productName} — ${company.tagline} A product of ${company.legalName}.`,
};

export default function AboutPage() {
  return (
    <MarketingShell headerPosition="sticky" cta={false} atmosphere>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-28 md:px-8 md:pt-32">
        <ShellPageIntro
          label="Company"
          title={company.tagline}
          description={company.mission}
        />

        <RevealOnScroll className="mt-12 max-w-3xl">
          <p className="font-sans text-[0.9375rem] leading-relaxed text-ash-soft">
            {company.productName} is developed and operated by{" "}
            {company.legalName}. We focus on {company.trades.join(", ")} — where
            missed calls become lost revenue.
          </p>
          <p className="mt-5 font-sans text-[0.9375rem] leading-relaxed text-ash-soft">
            The front door is Ring 1. It is live. Everything after — customers,
            jobs, field, money, intelligence, platform, marketplace — builds on
            that foundation. One ring at a time. Never skip.
          </p>
        </RevealOnScroll>

        <RevealOnScroll className="mt-16">
          <ShellVoidPanel className="p-6 md:p-10">
            <p className="eyebrow">Orvius OS</p>
            <p className="mt-3 font-serif text-2xl tracking-[-0.03em] text-chalk">
              Eight rings. One system.
            </p>
            <div className="mt-10">
              <OsRings variant="dark" />
            </div>
          </ShellVoidPanel>
        </RevealOnScroll>

        <RevealOnScroll className="mt-16">
          <ShellVoidPanel className="p-6 md:p-8">
            <p className="eyebrow">Legal entity</p>
            <p className="mt-3 font-serif text-2xl tracking-[-0.03em] text-chalk">
              {company.legalName}
            </p>
            <p className="mt-4 font-sans text-sm leading-relaxed text-ash-soft">
              Contracts, invoices, and subscriptions are with {company.legalName}.
              {company.productName} is our product brand for service-business
              operators.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/legal" className="btn btn-on-void-secondary">
                Legal center
              </Link>
              <Link href="/pricing" className="btn btn-on-void">
                View pricing
              </Link>
            </div>
          </ShellVoidPanel>
        </RevealOnScroll>
      </main>
    </MarketingShell>
  );
}
