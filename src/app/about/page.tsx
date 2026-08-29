import {
  MarketingShell,
  ShellPageIntro,
  ShellVoidPanel,
} from "@/components/marketing-shell";
import { RevealGroup, RevealOnScroll } from "@/components/reveal-on-scroll";
import { company, platformPillars } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: `${company.productName} is the AI operating partner for service businesses — a product of ${company.legalName}.`,
};

export default function AboutPage() {
  return (
    <MarketingShell headerPosition="sticky" cta={false} atmosphere>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-28 md:px-8 md:pt-32">
        <ShellPageIntro
          label="Company"
          title="Building the operating layer for service businesses."
          description={company.mission}
        />

        <RevealOnScroll className="mt-12 max-w-3xl">
          <p className="font-sans text-[0.9375rem] leading-relaxed text-ash-soft">
            {company.productName} is developed and operated by{" "}
            {company.legalName}. We focus on home services —{" "}
            {company.trades.join(", ")} — where missed calls directly become
            lost revenue. Our first capability is the AI receptionist: always
            answered, always qualified, always in the owner&apos;s hand.
          </p>
          <p className="mt-5 font-sans text-[0.9375rem] leading-relaxed text-ash-soft">
            That front door is the wedge. The platform is the long-term vision:
            the same intelligence that captures leads can extend to scheduling,
            follow-up, and shop operations — without replacing the tradespeople
            who do the work.
          </p>
        </RevealOnScroll>

        <RevealGroup className="mt-16 grid gap-6 md:grid-cols-3">
          {platformPillars.map((item) => (
            <ShellVoidPanel key={item.title} className="reveal-item p-6">
              <p className="font-serif text-xl tracking-[-0.03em] text-chalk">
                {item.title}
              </p>
              <p className="mt-3 font-sans text-sm leading-relaxed text-ash-soft">
                {item.body}
              </p>
            </ShellVoidPanel>
          ))}
        </RevealGroup>

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
