import { HomeHeroProduct, OwnerAlertCard, SectionEyebrow } from "@/components/owner-alert-card";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import { ProfileMenu } from "@/components/profile-menu";
import Link from "next/link";

const steps = [
  {
    n: "01",
    title: "Answers",
    body: "Every inbound call and text — after hours or mid-job.",
  },
  {
    n: "02",
    title: "Qualifies",
    body: "Service, urgency, address, callback — captured cleanly.",
  },
  {
    n: "03",
    title: "Alerts you",
    body: "A precise owner summary with what you need to close.",
  },
];

export default function HomePage() {
  return (
    <>
      <ShellHeader plane="void" position="absolute" />

      <main className="bg-void">
        {/* Split hero — brand + product in one viewport */}
        <section className="orvius-atmosphere relative min-h-[100svh] overflow-hidden text-chalk">
          <div className="orvius-grain absolute inset-0" aria-hidden />

          <div className="relative mx-auto grid min-h-[100svh] max-w-6xl items-end gap-12 px-6 pb-14 pt-28 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pb-20 lg:pt-32 md:px-8">
            <div className="max-w-xl">
              <SectionEyebrow className="anim-rise">
                AI operating partner
              </SectionEyebrow>

              <h1 className="anim-rise anim-rise-delay-1 display-xl mt-6 font-serif text-chalk">
                Orvius
              </h1>

              <div className="anim-line mt-7 h-px w-full max-w-xs bg-flare/75 lg:max-w-sm" />

              <p className="anim-rise anim-rise-delay-2 mt-7 font-serif text-2xl leading-[1.15] text-chalk md:text-[1.65rem]">
                The front door of your business — always answered.
              </p>
              <p className="anim-rise anim-rise-delay-2 mt-4 max-w-md font-sans text-[0.9375rem] leading-relaxed text-ash-soft md:text-base">
                For HVAC, plumbing, and electrical shops that lose jobs to
                missed calls. Orvius picks up, qualifies, and puts the lead in
                your hand.
              </p>

              <div className="anim-rise anim-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
                <Link href="/pilot" className="btn btn-on-void">
                  Start free pilot
                </Link>
                <Link href="/demo" className="btn btn-on-void-secondary">
                  Hear a demo call
                </Link>
              </div>

              <p className="anim-rise anim-rise-delay-3 mt-5 inline-flex items-center gap-2 font-sans text-xs text-ash-soft">
                <span className="anim-pulse inline-block size-1.5 rounded-full bg-flare" />
                Built for service businesses
              </p>
            </div>

            <HomeHeroProduct />
          </div>
        </section>

        {/* How — editorial strip, not generic grid */}
        <section className="border-t section-rule bg-void">
          <div className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-20">
            <SectionEyebrow>The wedge</SectionEyebrow>
            <p className="mt-4 max-w-2xl font-serif text-2xl leading-snug text-chalk md:text-3xl">
              One job, done perfectly: never lose a lead to a missed call.
            </p>

            <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-white/10">
              {steps.map((item) => (
                <div key={item.n} className="md:px-8 md:first:pl-0 md:last:pr-0">
                  <p className="font-sans text-xs font-bold tracking-[0.22em] text-flare">
                    {item.n}
                  </p>
                  <h2 className="mt-3 font-serif text-2xl tracking-[-0.03em] text-chalk">
                    {item.title}
                  </h2>
                  <p className="mt-3 max-w-xs font-sans text-sm leading-relaxed text-ash-soft">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Statement */}
        <section className="border-t section-rule bg-panel">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:px-8 md:py-24 lg:grid-cols-2 lg:items-center lg:gap-20">
            <div>
              <SectionEyebrow>The gap</SectionEyebrow>
              <h2 className="display-lg mt-5 font-serif text-chalk">
                Big companies run on AI. Small businesses still run on missed
                calls.
              </h2>
              <p className="mt-5 max-w-md font-sans text-base leading-relaxed text-ash-soft">
                Orvius answers when you can&apos;t — then puts the lead in your
                hand before your competitor does.
              </p>
              <Link
                href="/demo"
                className="btn btn-on-void-secondary mt-8 inline-flex"
              >
                Try the demo
              </Link>
            </div>

            <OwnerAlertCard variant="void" />
          </div>
        </section>

        {/* Close */}
        <section className="border-t section-rule bg-void">
          <div className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24">
            <div className="flex flex-col gap-8 border border-white/10 bg-panel/40 p-8 md:flex-row md:items-end md:justify-between md:p-10">
              <div>
                <SectionEyebrow>Design partners</SectionEyebrow>
                <h2 className="display-lg mt-4 font-serif text-chalk">
                  First ten shops. Thirty days free.
                </h2>
                <p className="mt-4 max-w-md font-sans text-base text-ash-soft">
                  We set Orvius up with you. Prove it on real calls — not slides.
                </p>
              </div>
              <Link href="/pilot" className="btn btn-on-void shrink-0">
                Apply for the pilot
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <ProfileMenu statusLabel="Founder workspace" />
    </>
  );
}
