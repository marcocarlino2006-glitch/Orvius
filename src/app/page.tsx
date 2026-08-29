import { CallTranscriptProof, OwnerAlertCard, SectionEyebrow } from "@/components/owner-alert-card";
import { RevealGroup, RevealOnScroll } from "@/components/reveal-on-scroll";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import { TrustStrip } from "@/components/trust-strip";
import { ProfileMenu } from "@/components/profile-menu";
import { company, platformPillars } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orvius — The AI operating partner for service businesses",
  description:
    "Orvius is the AI operating partner for HVAC, plumbing, and electrical businesses. Every call answered. Every lead captured. Built for the long run by Solution Development LLC.",
  openGraph: {
    title: "Orvius — AI operating partner for service businesses",
    description:
      "The front door of your business — always answered. Platform built for home service operators.",
  },
};

const wedge = [
  {
    n: "01",
    title: "Answers",
    body: "Every call and text — after hours or mid-job.",
  },
  {
    n: "02",
    title: "Qualifies",
    body: "Service, urgency, address, callback — clean.",
  },
  {
    n: "03",
    title: "Alerts you",
    body: "A precise summary with what you need to close.",
  },
];

export default function HomePage() {
  return (
    <>
      <ShellHeader plane="void" position="sticky" surface="glass" />

      <main className="bg-void text-chalk">
        {/* I. Hero — category + product in one viewport */}
        <section className="home-hero orvius-atmosphere relative min-h-[100svh] overflow-hidden">
          <div className="orvius-grain absolute inset-0" aria-hidden />
          <div className="home-flare-accent absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-flare/50 to-transparent" aria-hidden />

          <div className="relative mx-auto grid min-h-[100svh] max-w-6xl items-end gap-14 px-6 pb-16 pt-28 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-20 lg:pb-20 lg:pt-32 md:px-8">
            <div className="max-w-[34rem]">
              <SectionEyebrow className="anim-rise">
                AI operating partner
              </SectionEyebrow>

              <h1 className="anim-rise anim-rise-delay-1 home-wordmark mt-8 font-serif text-chalk">
                Orvius
              </h1>

              <div className="anim-line mt-8 h-px w-16 bg-flare" />

              <p className="anim-rise anim-rise-delay-2 home-claim mt-8 font-serif text-chalk">
                The operating layer for service businesses — starting at the
                front door.
              </p>

              <p className="anim-rise anim-rise-delay-2 mt-5 max-w-md font-sans text-[0.9375rem] leading-[1.65] text-ash-soft">
                {company.mission} Today: every call answered, every lead
                qualified, every owner alerted.
              </p>

              <div className="anim-rise anim-rise-delay-3 mt-10 flex flex-wrap items-center gap-3">
                <Link href="/pilot" className="btn btn-on-void">
                  Start free pilot
                </Link>
                <Link href="/demo" className="btn btn-on-void-secondary">
                  Hear a demo call
                </Link>
              </div>

              <p className="anim-rise anim-rise-delay-3 mt-8 font-sans text-[11px] font-semibold tracking-[0.2em] text-ash-soft uppercase">
                HVAC · Plumbing · Electrical
              </p>
            </div>

            <OwnerAlertCard
              variant="void"
              className="product-float product-glow w-full max-w-md lg:max-w-none lg:justify-self-end"
            />
          </div>
        </section>

        {/* II. Platform — how it works today */}
        <section className="home-section border-t border-white/8 bg-void">
          <div className="mx-auto max-w-6xl px-6 md:px-8">
            <RevealOnScroll>
              <div className="home-section-head">
                <SectionEyebrow>Platform</SectionEyebrow>
                <p className="home-section-title mt-5 font-serif text-chalk">
                  Reception first. Operations next.
                </p>
                <p className="mt-4 max-w-2xl font-sans text-[0.9375rem] leading-relaxed text-ash-soft">
                  {company.productName} starts where revenue is won or lost — the
                  inbound call — then expands across the shop. One intelligence
                  layer, built for {company.trades.join(", ")}, and the trades
                  that follow.
                </p>
              </div>
            </RevealOnScroll>

            <RevealGroup className="mt-14 grid gap-12 md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/8">
              {platformPillars.map((item, i) => (
                <div
                  key={item.title}
                  className="reveal-item md:px-10 md:first:pl-0 md:last:pr-0"
                >
                  <p className="font-sans text-[11px] font-bold tracking-[0.24em] text-flare">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <h2 className="mt-4 font-serif text-[1.65rem] tracking-[-0.03em] text-chalk">
                    {item.title}
                  </h2>
                  <p className="mt-3 max-w-[14rem] font-sans text-sm leading-relaxed text-ash-soft">
                    {item.body}
                  </p>
                </div>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* III. Wedge proof — one job done perfectly */}
        <section className="home-section border-t border-white/8 bg-panel/30">
          <div className="mx-auto max-w-6xl px-6 md:px-8">
            <RevealOnScroll>
              <div className="home-section-head">
                <SectionEyebrow>Live today</SectionEyebrow>
                <p className="home-section-title mt-5 font-serif text-chalk">
                  One job. Done perfectly.
                </p>
                <p className="mt-4 max-w-xl font-sans text-[0.9375rem] leading-relaxed text-ash-soft">
                  Answer → qualify → alert. The receptionist loop that pays for
                  itself on the first booked job.
                </p>
              </div>
            </RevealOnScroll>

            <RevealGroup className="mt-14 grid gap-12 md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/8">
              {wedge.map((item) => (
                <div
                  key={item.n}
                  className="reveal-item md:px-10 md:first:pl-0 md:last:pr-0"
                >
                  <p className="font-sans text-[11px] font-bold tracking-[0.24em] text-flare">
                    {item.n}
                  </p>
                  <h2 className="mt-4 font-serif text-[1.65rem] tracking-[-0.03em] text-chalk">
                    {item.title}
                  </h2>
                  <p className="mt-3 max-w-[14rem] font-sans text-sm leading-relaxed text-ash-soft">
                    {item.body}
                  </p>
                </div>
              ))}
            </RevealGroup>
          </div>
        </section>

        {/* IV. Statement — typographic proof */}
        <section className="home-section border-t border-white/8 bg-panel">
          <div className="mx-auto grid max-w-6xl gap-16 px-6 md:px-8 lg:grid-cols-2 lg:items-start lg:gap-20">
            <RevealOnScroll>
              <div>
                <SectionEyebrow>The gap</SectionEyebrow>
                <h2 className="home-statement mt-6 font-serif text-chalk">
                  Big companies run on AI. Small businesses still run on missed
                  calls.
                </h2>
                <p className="mt-6 max-w-md font-sans text-[0.9375rem] leading-[1.65] text-ash-soft">
                  {company.productName} gives service shops the same front-door
                  intelligence — without hiring a receptionist or buying
                  enterprise software they will never use.
                </p>
              </div>
            </RevealOnScroll>
            <RevealOnScroll delay={120}>
              <CallTranscriptProof />
            </RevealOnScroll>
          </div>
        </section>

        <TrustStrip />

        {/* V. Close */}
        <section className="home-section border-t border-white/8 bg-void">
          <div className="mx-auto max-w-6xl px-6 md:px-8">
            <RevealOnScroll>
              <div className="home-close border border-white/10 bg-panel/50 p-8 md:flex md:items-end md:justify-between md:p-12">
              <div className="max-w-lg">
                <SectionEyebrow>Get started</SectionEyebrow>
                <h2 className="home-close-title mt-5 font-serif text-chalk">
                  Built for the long run. Start with a free pilot.
                </h2>
                <p className="mt-4 font-sans text-[0.9375rem] leading-relaxed text-ash-soft">
                  We onboard your shop personally. Prove {company.productName} on
                  real calls — then scale on your line.
                </p>
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row md:mt-0">
                <Link
                  href="/about"
                  className="btn btn-on-void-secondary shrink-0"
                >
                  About Orvius
                </Link>
                <Link
                  href="/pricing"
                  className="btn btn-on-void-secondary shrink-0"
                >
                  View pricing
                </Link>
                <Link href="/pilot" className="btn btn-on-void shrink-0">
                  Apply for pilot
                </Link>
              </div>
              </div>
            </RevealOnScroll>
          </div>
        </section>
      </main>

      <SiteFooter />
      <ProfileMenu statusLabel="Founder workspace" />
    </>
  );
}
