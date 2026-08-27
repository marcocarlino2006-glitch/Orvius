import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { ProfileMenu } from "@/components/profile-menu";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <SiteNav />

      {/* Hero — brand, headline, sentence, CTA, full-bleed image */}
      <section className="relative min-h-[100svh] overflow-hidden bg-ink text-paper">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=2400&q=80"
            alt="Service technician at an electrical panel"
            className="hero-media h-full w-full object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(20,20,19,0.88)_0%,rgba(20,20,19,0.55)_48%,rgba(20,20,19,0.28)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,20,19,0.35)_0%,transparent_28%,rgba(20,20,19,0.72)_100%)]" />
        </div>

        <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-6 pb-20 pt-32 md:px-8 md:pb-28">
          <p className="animate-rise font-sans text-sm font-500 tracking-[0.22em] text-paper/70 uppercase">
            Orvius
          </p>

          <h1 className="animate-rise-delay mt-6 max-w-4xl font-serif text-[2.75rem] leading-[1.05] tracking-[-0.03em] md:text-6xl lg:text-7xl">
            Every call answered.
            <br />
            Every lead captured.
          </h1>

          <p className="animate-rise-delay-2 mt-7 max-w-xl font-serif text-xl leading-relaxed text-paper/72 md:text-2xl">
            The AI operating partner for service businesses.
          </p>

          <div className="animate-rise-delay-2 mt-10">
            <Link href="/pilot" className="btn bg-paper text-ink hover:bg-white">
              Start free pilot
            </Link>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-paper py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6 md:px-8">
          <h2 className="max-w-4xl font-serif text-4xl leading-[1.12] tracking-[-0.03em] md:text-5xl lg:text-6xl">
            Big companies run on AI.
            <span className="text-muted"> Small businesses still run on missed calls.</span>
          </h2>
          <p className="mt-8 max-w-2xl font-serif text-xl leading-relaxed text-muted md:text-2xl">
            Orvius answers when you can&apos;t — qualifies the job, books the next
            step, and puts a clean summary in your hand.
          </p>
        </div>
      </section>

      {/* How */}
      <section id="how" className="border-y border-line bg-surface/70 py-24 md:py-32">
        <div className="mx-auto max-w-6xl px-6 md:px-8">
          <p className="font-sans text-sm font-500 tracking-[0.18em] text-muted uppercase">
            How it works
          </p>
          <h2 className="mt-4 max-w-3xl font-serif text-4xl leading-tight tracking-[-0.03em] md:text-5xl">
            From unanswered to booked.
          </h2>

          <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
            {[
              {
                n: "01",
                title: "Orvius answers",
                body: "Calls and texts, after hours or mid-job — instantly.",
              },
              {
                n: "02",
                title: "Qualifies the work",
                body: "Service, urgency, address, and callback — captured cleanly.",
              },
              {
                n: "03",
                title: "You stay in control",
                body: "Owner alert with everything you need to close.",
              },
            ].map((step) => (
              <div key={step.n}>
                <p className="font-sans text-sm font-500 text-accent">{step.n}</p>
                <h3 className="mt-4 font-serif text-3xl tracking-[-0.02em]">
                  {step.title}
                </h3>
                <p className="mt-4 font-serif text-lg leading-relaxed text-muted">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product surface */}
      <section className="bg-paper py-24 md:py-32">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 md:px-8 lg:grid-cols-2">
          <div>
            <p className="font-sans text-sm font-500 tracking-[0.18em] text-muted uppercase">
              Product
            </p>
            <h2 className="mt-4 font-serif text-4xl leading-tight tracking-[-0.03em] md:text-5xl">
              Built for the field.
            </h2>
            <p className="mt-6 max-w-md font-serif text-xl leading-relaxed text-muted">
              While you&apos;re on a job, Orvius takes the next one. You get a
              precise summary — not a voicemail.
            </p>
            <Link href="/demo" className="btn btn-secondary mt-9">
              See a demo call
            </Link>
          </div>

          <div className="rounded-2xl bg-ink p-8 text-paper md:p-10">
            <p className="font-sans text-xs font-500 tracking-[0.2em] text-paper/45 uppercase">
              Owner alert
            </p>
            <p className="mt-5 font-serif text-3xl leading-snug tracking-[-0.02em]">
              New lead from Maria Lopez
            </p>
            <div className="mt-8 space-y-3 font-serif text-base leading-relaxed text-paper/70">
              <p>Phone · +1 512 555 0123</p>
              <p>Service · AC not cooling</p>
              <p>Urgency · Emergency</p>
              <p>Address · 1842 Oak Street, Austin</p>
              <p className="border-t border-white/10 pt-4 text-paper/55">
                Prefers today after 4pm. Callback confirmed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA — dark band like category leaders */}
      <section className="bg-ink py-24 text-paper md:py-32">
        <div className="mx-auto max-w-6xl px-6 md:px-8">
          <h2 className="max-w-3xl font-serif text-4xl leading-tight tracking-[-0.03em] md:text-6xl">
            First ten shops. Thirty days free.
          </h2>
          <p className="mt-6 max-w-xl font-serif text-xl leading-relaxed text-paper/65">
            We set Orvius up with you. Prove it on real calls.
          </p>
          <Link
            href="/pilot"
            className="btn mt-10 bg-paper text-ink hover:bg-white"
          >
            Apply for the pilot
          </Link>
        </div>
      </section>

      <SiteFooter />
      <ProfileMenu statusLabel="Founder workspace" />
    </>
  );
}
