import { CallTranscriptProof, OwnerAlertCard, SectionEyebrow } from "@/components/owner-alert-card";
import { EnterpriseStatement } from "@/components/enterprise-statement";
import { HeroMetrics } from "@/components/hero-metrics";
import { PlatformBento } from "@/components/platform-bento";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import { TrustStrip } from "@/components/trust-strip";
import { ProfileMenu } from "@/components/profile-menu";
import { company } from "@/lib/company";
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

export default function HomePage() {
  return (
    <>
      <ShellHeader plane="void" position="sticky" surface="glass" />

      <main className="bg-void text-chalk">
        {/* Hero — cinematic, product-forward */}
        <section className="home-hero orvius-atmosphere relative min-h-[100svh] overflow-hidden">
          <div className="hero-grid absolute inset-0" aria-hidden />
          <div className="orvius-grain absolute inset-0" aria-hidden />
          <div className="home-flare-accent absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-flare/50 to-transparent" aria-hidden />

          <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col px-6 pb-8 pt-28 md:px-8 lg:pt-32">
            <div className="grid flex-1 items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
              <div className="max-w-[36rem]">
                <div className="anim-rise flex items-center gap-3">
                  <span className="hero-brand-mark" aria-hidden />
                  <p className="font-sans text-[11px] font-semibold tracking-[0.28em] text-chalk/70 uppercase">
                    Orvius
                  </p>
                </div>

                <h1 className="anim-rise anim-rise-delay-1 hero-headline mt-10 font-serif text-chalk">
                  Every call answered.
                  <span className="hero-headline-accent"> Every lead captured.</span>
                </h1>

                <p className="anim-rise anim-rise-delay-2 mt-8 max-w-lg font-sans text-[1.0625rem] leading-[1.7] text-ash-soft">
                  The AI operating partner for {company.trades.join(", ")} — and
                  the service businesses that run on them. {company.mission}
                </p>

                <div className="anim-rise anim-rise-delay-3 mt-10 flex flex-wrap items-center gap-3">
                  <Link href="/pilot" className="btn btn-on-void btn-premium">
                    Start free pilot
                  </Link>
                  <Link href="/demo" className="btn btn-on-void-secondary">
                    Hear a demo call
                  </Link>
                </div>
              </div>

              <div className="relative lg:justify-self-end">
                <div className="hero-product-ring absolute -inset-8 rounded-full opacity-60 blur-3xl" aria-hidden />
                <OwnerAlertCard
                  variant="void"
                  className="product-float product-glow relative w-full max-w-md lg:max-w-none"
                />
              </div>
            </div>

            <HeroMetrics />
          </div>
        </section>

        <PlatformBento />

        <EnterpriseStatement />

        {/* Proof — live product moment */}
        <section className="home-section border-t border-white/8 bg-panel/30">
          <div className="mx-auto grid max-w-6xl gap-16 px-6 md:px-8 lg:grid-cols-2 lg:items-center lg:gap-20">
            <RevealOnScroll>
              <div>
                <SectionEyebrow>Live today</SectionEyebrow>
                <h2 className="home-section-title mt-5 font-serif text-chalk">
                  Real calls. Real leads. Real owners notified.
                </h2>
                <p className="mt-5 max-w-md font-sans text-[0.9375rem] leading-[1.65] text-ash-soft">
                  Summit HVAC runs on Orvius right now — after-hours emergencies,
                  same-day requests, and routine inquiries handled without a
                  receptionist on payroll.
                </p>
                <Link
                  href="/demo"
                  className="btn btn-on-void-secondary mt-8 inline-flex"
                >
                  Listen to a demo call →
                </Link>
              </div>
            </RevealOnScroll>
            <RevealOnScroll delay={120}>
              <CallTranscriptProof className="proof-card" />
            </RevealOnScroll>
          </div>
        </section>

        <TrustStrip />

        {/* Close */}
        <section className="home-section border-t border-white/8 bg-void">
          <div className="mx-auto max-w-6xl px-6 md:px-8">
            <RevealOnScroll>
              <div className="home-close border border-white/10 bg-panel/50 p-8 md:flex md:items-end md:justify-between md:p-14">
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
                  <Link href="/about" className="btn btn-on-void-secondary shrink-0">
                    About Orvius
                  </Link>
                  <Link href="/pricing" className="btn btn-on-void-secondary shrink-0">
                    View pricing
                  </Link>
                  <Link href="/pilot" className="btn btn-on-void btn-premium shrink-0">
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
