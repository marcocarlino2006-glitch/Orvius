import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import Link from "next/link";

const steps = [
  {
    title: "Orvius answers",
    body: "Every inbound call and text — after hours, lunch rush, or while you're on a job.",
  },
  {
    title: "Qualifies the lead",
    body: "Service type, urgency, address, and callback number, captured cleanly.",
  },
  {
    title: "You get the summary",
    body: "Instant owner alert with everything you need to close the job.",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteNav />

      {/* Hero — one composition: brand, headline, sentence, CTA, full-bleed image */}
      <section className="relative min-h-[100svh] overflow-hidden bg-ink text-paper">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=2400&q=80"
            alt="Service technician at work"
            className="hero-media h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/70 to-ink/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-ink/30" />
        </div>

        <div className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-6 pb-16 pt-28 md:pb-24 md:pt-32">
          <p
            className="animate-rise font-display text-6xl font-800 leading-none tracking-tight md:text-8xl lg:text-9xl"
            style={{ fontWeight: 800 }}
          >
            Orvius
          </p>

          <h1 className="animate-rise-delay mt-6 max-w-xl font-display text-2xl font-600 leading-snug md:text-4xl">
            Never miss another job because a call went unanswered.
          </h1>

          <p className="animate-rise-delay-2 mt-4 max-w-md text-base leading-relaxed text-paper/75 md:text-lg">
            The AI receptionist for service businesses — answers, qualifies, and
            gets the lead to you.
          </p>

          <div className="animate-rise-delay-2 mt-8 flex flex-wrap gap-3">
            <Link href="/pilot" className="btn btn-primary bg-accent text-paper">
              Start free pilot
            </Link>
            <a href="#how" className="btn btn-secondary border-paper/40 text-paper hover:bg-paper hover:text-ink">
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* Problem — one job */}
      <section className="border-b border-line py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="max-w-3xl font-display text-3xl font-700 leading-tight md:text-5xl">
            Big companies have AI ops teams.
            <span className="text-muted"> You have voicemail.</span>
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            A missed call isn&apos;t a missed message — it&apos;s a lost job.
            Orvius makes sure every opportunity gets answered.
          </p>
        </div>
      </section>

      {/* How it works — one job, no cards */}
      <section id="how" className="border-b border-line bg-surface/60 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl font-700 md:text-5xl">
            From ring to owner alert
          </h2>
          <p className="mt-4 max-w-lg text-muted">
            One loop. Built for HVAC, plumbing, electrical, and home services.
          </p>

          <ol className="mt-14 space-y-10 md:space-y-0 md:grid md:grid-cols-3 md:gap-12">
            {steps.map((step, index) => (
              <li key={step.title} className="relative">
                <p className="font-display text-5xl font-700 text-accent/30">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 font-display text-2xl font-600">{step.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Product — one job, one visual anchor */}
      <section id="product" className="border-b border-line py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-700 md:text-5xl">
              Built for the truck, not the office
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
              While you&apos;re on a job, Orvius answers the next one. You get a
              clean summary by text — who called, what they need, how urgent it is.
            </p>
            <Link href="/demo" className="btn btn-secondary mt-8">
              Watch a demo call
            </Link>
          </div>

          <div className="relative overflow-hidden rounded-lg bg-ink p-6 text-paper shadow-[0_24px_60px_rgba(14,16,19,0.18)] md:p-8">
            <p className="text-xs uppercase tracking-[0.18em] text-paper/50">
              Owner alert
            </p>
            <p className="mt-4 font-display text-2xl font-600 leading-snug">
              New lead from Maria Lopez
            </p>
            <div className="mt-6 space-y-3 text-sm leading-relaxed text-paper/75">
              <p>Phone: +1 512 555 0123</p>
              <p>Service: AC not cooling</p>
              <p>Urgency: Emergency</p>
              <p>Address: 1842 Oak Street, Austin TX</p>
              <p className="border-t border-white/10 pt-3">
                Prefers today after 4pm. Orvius confirmed callback number.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pilot CTA — one job */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="relative overflow-hidden rounded-lg bg-accent px-8 py-14 text-paper md:px-14 md:py-20">
            <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
            <div className="absolute -bottom-20 left-1/3 h-64 w-64 rounded-full bg-black/10" />
            <div className="relative max-w-2xl">
              <h2 className="font-display text-3xl font-700 md:text-5xl">
                First 10 shops get Orvius free for 30 days
              </h2>
              <p className="mt-4 text-lg text-paper/80">
                We set it up with you. No credit card. Prove it on real calls.
              </p>
              <Link
                href="/pilot"
                className="btn mt-8 bg-paper text-ink hover:bg-white"
              >
                Apply for the pilot
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
