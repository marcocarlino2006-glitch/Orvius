import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { EarlyAccessForm } from "@/components/early-access-form";
import Link from "next/link";

const steps = [
  {
    num: "01",
    title: "Call or text comes in",
    body: "After hours, lunch rush, or while you're on a job — Orvius picks up instantly.",
  },
  {
    num: "02",
    title: "AI qualifies the lead",
    body: "Service type, urgency, address, and callback number — captured naturally.",
  },
  {
    num: "03",
    title: "Books or schedules follow-up",
    body: "Appointment booked or callback request logged. No lead slips through.",
  },
  {
    num: "04",
    title: "Owner gets notified",
    body: "Clean summary via SMS or email. Every conversation logged in your dashboard.",
  },
];

const features = [
  {
    title: "AI receptionist",
    body: "Answers every inbound call and text like a trained front desk — 24/7.",
  },
  {
    title: "Lead qualification",
    body: "Captures service type, urgency, location, and contact info automatically.",
  },
  {
    title: "Appointment booking",
    body: "Schedules estimates and service calls directly into your calendar.",
  },
  {
    title: "Owner alerts",
    body: "Instant SMS summary so you know exactly who called and what they need.",
  },
  {
    title: "Business memory",
    body: "Every customer, call, and note in one place — your AI-powered CRM.",
  },
  {
    title: "Human fallback",
    body: "Transfers to you or takes a message when the AI isn't confident.",
  },
];

const stats = [
  { value: "24/7", label: "Coverage" },
  { value: "<3s", label: "Answer time" },
  { value: "100%", label: "Calls logged" },
  { value: "$0", label: "Missed leads" },
];

export default function HomePage() {
  return (
    <>
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.12)_0%,_transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 md:pb-28 md:pt-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1.5 text-sm text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            Now onboarding home service businesses
          </div>

          <h1 className="mt-8 max-w-4xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">
            Never miss another job because a call went{" "}
            <span className="bg-gradient-to-r from-sky-300 to-blue-400 bg-clip-text text-transparent">
              unanswered
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted md:text-xl">
            Orvius is the AI receptionist for service businesses. It answers calls,
            qualifies leads, books appointments, and keeps owners in the loop — so
            you can focus on the work that pays.
          </p>

          <div id="early-access" className="mt-10 max-w-lg">
            <EarlyAccessForm />
            <p className="mt-3 text-xs text-muted">
              Free 30-day pilot for the first 10 businesses. No credit card.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center md:text-left">
                <p className="text-3xl font-semibold text-sky-300">{stat.value}</p>
                <p className="mt-1 text-sm text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-border/60 bg-card/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-sm uppercase tracking-[0.2em] text-sky-300">The problem</p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold md:text-4xl">
            Big companies have AI ops teams. You have voicemail.
          </h2>
          <p className="mt-4 max-w-2xl text-muted leading-relaxed">
            A missed call isn&apos;t just an inconvenience — it&apos;s a lost job worth
            hundreds or thousands of dollars. Most small service businesses lose
            20–40% of inbound leads simply because nobody picked up.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-sm uppercase tracking-[0.2em] text-sky-300">How it works</p>
          <h2 className="mt-4 text-3xl font-semibold md:text-4xl">
            From ring to booked in under 2 minutes
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.num} className="card p-6">
                <p className="font-mono text-sm text-sky-300">{step.num}</p>
                <h3 className="mt-3 font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-y border-border/60 bg-card/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Features</p>
          <h2 className="mt-4 text-3xl font-semibold md:text-4xl">
            Everything a front desk does — without the overhead
          </h2>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-border p-6">
                <h3 className="font-medium">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-sm uppercase tracking-[0.2em] text-sky-300">Pricing</p>
          <h2 className="mt-4 text-3xl font-semibold md:text-4xl">
            Simple pricing. Obvious ROI.
          </h2>
          <p className="mt-4 max-w-xl text-muted">
            One saved job pays for months of Orvius. Start free, scale when it works.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:max-w-3xl">
            <div className="card p-8">
              <p className="text-sm font-medium text-sky-300">Pilot</p>
              <p className="mt-4 text-4xl font-semibold">
                Free
                <span className="text-base font-normal text-muted"> / 30 days</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted">
                <li>✓ AI call + SMS receptionist</li>
                <li>✓ Lead capture & owner alerts</li>
                <li>✓ Personal onboarding</li>
                <li>✓ Unlimited calls during pilot</li>
              </ul>
              <Link href="#early-access" className="btn btn-primary mt-8 block text-center">
                Start free pilot
              </Link>
            </div>

            <div className="card border-sky-500/40 p-8">
              <p className="text-sm font-medium text-sky-300">Pro</p>
              <p className="mt-4 text-4xl font-semibold">
                $299
                <span className="text-base font-normal text-muted"> / month</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted">
                <li>✓ Everything in Pilot</li>
                <li>✓ Calendar booking integration</li>
                <li>✓ Business memory & CRM</li>
                <li>✓ Priority support</li>
              </ul>
              <Link href="#early-access" className="btn btn-secondary mt-8 block text-center">
                Join waitlist
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border/60 bg-gradient-to-b from-sky-500/5 to-transparent py-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-semibold md:text-4xl">
            Stop losing jobs to voicemail
          </h2>
          <p className="mt-4 text-muted">
            Join the first 10 home service businesses on Orvius. Free for 30 days.
          </p>
          <div className="mt-8">
            <EarlyAccessForm />
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
