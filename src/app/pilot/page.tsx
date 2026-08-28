import {
  MarketingShell,
  ShellPageIntro,
  ShellVoidPanel,
} from "@/components/marketing-shell";
import { EarlyAccessForm } from "@/components/early-access-form";
import { OwnerAlertCard } from "@/components/owner-alert-card";
import { RevealGroup, RevealOnScroll } from "@/components/reveal-on-scroll";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free pilot",
  description:
    "First ten HVAC, plumbing, and electrical shops. Thirty days free. Orvius answers every call.",
};

const benefits = [
  {
    n: "01",
    title: "Answers every call",
    body: "24/7 receptionist — after hours, weekends, mid-job.",
  },
  {
    n: "02",
    title: "Qualifies the lead",
    body: "Service, urgency, address, callback — clean every time.",
  },
  {
    n: "03",
    title: "Alerts you instantly",
    body: "SMS + dashboard — everything you need to close.",
  },
];

export default function PilotPage() {
  return (
    <MarketingShell headerPosition="sticky" cta={false} atmosphere>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-28 md:px-8 md:pt-32">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16">
          <div className="order-2 lg:order-1">
            <ShellPageIntro
              label="Free pilot"
              title="Get Orvius answering your calls this week."
              description="Ten home-service businesses. Thirty days free. We set it up with you — no credit card."
            />

            <RevealGroup className="mt-12 space-y-5 border-t border-white/10 pt-8">
              {benefits.map((item) => (
                <div key={item.n} className="reveal-item flex gap-4">
                  <p className="font-sans text-[11px] font-bold tracking-[0.24em] text-flare">
                    {item.n}
                  </p>
                  <div>
                    <p className="font-serif text-lg tracking-[-0.03em] text-chalk">
                      {item.title}
                    </p>
                    <p className="mt-1 font-sans text-sm leading-relaxed text-ash-soft">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </RevealGroup>

            <RevealOnScroll className="mt-10 lg:hidden">
              <ShellVoidPanel className="p-6 md:p-8">
                <EarlyAccessForm variant="full" />
              </ShellVoidPanel>
            </RevealOnScroll>
          </div>

          <div className="order-1 space-y-6 lg:order-2">
            <RevealOnScroll delay={80}>
              <OwnerAlertCard
                variant="void"
                className="product-float product-glow"
              />
            </RevealOnScroll>
            <RevealOnScroll delay={160} className="hidden lg:block">
              <ShellVoidPanel className="p-6 md:p-8">
                <p className="eyebrow">Apply now</p>
                <p className="mt-3 font-serif text-xl tracking-[-0.03em] text-chalk">
                  First ten shops
                </p>
                <p className="mt-2 font-sans text-sm text-ash-soft">
                  We onboard you personally. Live on your number within days.
                </p>
                <div className="mt-6">
                  <EarlyAccessForm variant="full" />
                </div>
              </ShellVoidPanel>
            </RevealOnScroll>
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}
