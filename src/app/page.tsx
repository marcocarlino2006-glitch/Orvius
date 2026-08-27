import { SiteFooter } from "@/components/site-footer";
import { ProfileMenu } from "@/components/profile-menu";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-8">
          <Link
            href="/"
            className="font-sans text-sm font-semibold tracking-[0.22em] text-paper uppercase"
          >
            Orvius
          </Link>
          <div className="flex items-center gap-5">
            <Link
              href="/dashboard"
              className="hidden font-sans text-sm text-paper/50 transition hover:text-paper md:inline"
            >
              Product
            </Link>
            <Link href="/pilot" className="btn home-btn-primary">
              Start free pilot
            </Link>
          </div>
        </div>
      </header>

      <main className="bg-[#07110e]">
        {/* One composition: brand dominates the first viewport */}
        <section className="orvius-atmosphere relative min-h-[100svh] overflow-hidden text-[#f2f7f4]">
          <div className="orvius-grain absolute inset-0" aria-hidden />

          <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-6 pb-14 pt-28 md:px-8 md:pb-16 md:pt-32">
            <p className="anim-rise font-sans text-xs font-semibold tracking-[0.28em] text-[#3dd68c] uppercase">
              AI operating partner
            </p>

            <h1 className="anim-rise anim-rise-delay-1 mt-5 font-serif text-[clamp(4.5rem,18vw,12.5rem)] leading-[0.82] tracking-[-0.07em] text-[#f2f7f4]">
              Orvius
            </h1>

            <div className="anim-line mt-8 h-px w-full max-w-3xl bg-[#3dd68c]/70" />

            <div className="anim-rise anim-rise-delay-2 mt-7 max-w-2xl">
              <p className="font-serif text-2xl leading-snug text-[#f2f7f4] md:text-3xl">
                The front door of your business — always answered.
              </p>
              <p className="mt-3 font-sans text-base leading-relaxed text-[#8aa399] md:text-lg">
                For HVAC, plumbing, and electrical shops that lose jobs to
                missed calls. Orvius picks up, qualifies, and puts the lead in
                your hand.
              </p>
            </div>

            <div className="anim-rise anim-rise-delay-3 mt-9 flex flex-wrap items-center gap-4">
              <Link href="/pilot" className="btn home-btn-primary">
                Start free pilot
              </Link>
              <Link href="/demo" className="btn home-btn-secondary">
                Hear a demo call
              </Link>
              <span className="inline-flex items-center gap-2 font-sans text-sm text-[#8aa399]">
                <span className="anim-pulse inline-block size-2 rounded-full bg-[#3dd68c]" />
                Live for service businesses
              </span>
            </div>
          </div>
        </section>

        {/* How it works — one job */}
        <section className="border-t border-white/10 bg-[#07110e] text-[#f2f7f4]">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-3 md:gap-8 md:px-8 md:py-20">
            {[
              {
                step: "01",
                title: "Answers",
                body: "Every inbound call and text — after hours or mid-job.",
              },
              {
                step: "02",
                title: "Qualifies",
                body: "Service, urgency, address, callback — captured cleanly.",
              },
              {
                step: "03",
                title: "Alerts you",
                body: "A precise owner summary with what you need to close.",
              },
            ].map((item) => (
              <div key={item.step}>
                <p className="font-sans text-xs font-semibold tracking-[0.2em] text-[#3dd68c] uppercase">
                  {item.step}
                </p>
                <h2 className="mt-3 font-serif text-3xl tracking-[-0.03em]">
                  {item.title}
                </h2>
                <p className="mt-3 max-w-xs font-sans text-base leading-relaxed text-[#8aa399]">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Product proof */}
        <section className="border-t border-white/10 bg-[#0f1c18]">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:px-8 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
            <div>
              <h2 className="font-serif text-3xl leading-[1.12] tracking-[-0.03em] text-[#f2f7f4] md:text-5xl">
                Big companies run on AI. Small businesses still run on missed
                calls.
              </h2>
              <p className="mt-5 max-w-lg font-sans text-lg leading-relaxed text-[#8aa399]">
                Orvius answers when you can&apos;t — then puts the lead in your
                hand.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#07110e]/80 p-6 shadow-[0_0_0_1px_rgba(61,214,140,0.08)] md:p-8">
              <div className="flex items-center justify-between gap-3">
                <p className="font-sans text-xs font-semibold tracking-[0.18em] text-[#3dd68c] uppercase">
                  Owner alert
                </p>
                <span className="font-sans text-xs text-[#8aa399]">just now</span>
              </div>
              <p className="mt-4 font-serif text-2xl text-[#f2f7f4] md:text-3xl">
                New lead from Maria Lopez
              </p>
              <dl className="mt-6 space-y-0 font-sans text-sm text-[#8aa399]">
                {[
                  ["Phone", "+1 512 555 0123"],
                  ["Service", "AC not cooling"],
                  ["Urgency", "Emergency"],
                  ["Address", "1842 Oak Street"],
                ].map(([label, value], i, arr) => (
                  <div
                    key={label}
                    className={`flex justify-between gap-4 py-3 ${
                      i < arr.length - 1 ? "border-b border-white/10" : ""
                    }`}
                  >
                    <dt>{label}</dt>
                    <dd className="text-[#f2f7f4]">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        {/* Close */}
        <section className="border-t border-white/10 bg-[#07110e]">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16 md:flex-row md:items-end md:justify-between md:px-8 md:py-20">
            <div>
              <h2 className="font-serif text-3xl tracking-[-0.03em] text-[#f2f7f4] md:text-5xl">
                First ten shops.
                <br />
                Thirty days free.
              </h2>
              <p className="mt-4 max-w-md font-sans text-lg text-[#8aa399]">
                We set Orvius up with you. Prove it on real calls.
              </p>
            </div>
            <Link href="/pilot" className="btn home-btn-primary shrink-0">
              Apply for the pilot
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
      <ProfileMenu statusLabel="Founder workspace" />
    </>
  );
}
