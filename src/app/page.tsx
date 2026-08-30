import { BrandIntro } from "@/components/brand-intro";
import { HomeChangelog } from "@/components/home-changelog";
import { HomeHeroActions } from "@/components/home-hero-actions";
import { HomeLiveLine } from "@/components/home-live-line";
import {
  HomeOsAsk,
  HomeOsCall,
  HomeOsDispatch,
  HomeOsFrame,
  HomeOsJobs,
  HomeProductStage,
} from "@/components/home-product-stage";
import { OrviusOsStrip } from "@/components/orvius-os-strip";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import { company, pricing } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orvius — Never miss a call again",
  description:
    "The operating system for HVAC, plumbing, and electrical shops. Orvius answers every call, qualifies the lead, texts the owner, and runs the job from one place.",
  openGraph: {
    title: "Orvius — Never miss a call again",
    description:
      "Every call answered. Every lead in your hand. The OS for owner-operators who are on the job — not behind a desk.",
  },
};

export default function HomePage() {
  return (
    <>
      <ShellHeader plane="chalk" />

      <main className="editorial home-page bg-chalk text-void">
        <section className="home-hero">
          <div className="editorial-wrap home-hero-copy">
            <BrandIntro
              kicker="Orvius"
              title="Never miss a call again."
              subline={company.tagline}
              description="Answers, qualifies, and texts you the lead — while you're on the job, after hours, or at peak season. One saved emergency pays for the month."
            />
            <OrviusOsStrip variant="hero" />
            <div className="home-hero-live">
              <p className="home-hero-live-label font-sans">Call the live line</p>
              <HomeLiveLine />
              <p className="home-hero-live-proof font-sans">
                Summit HVAC is on it today · {company.trades.join(" · ")}
              </p>
            </div>
            <HomeHeroActions />
          </div>

          <div className="home-hero-stage">
            <div className="home-stage-wrap">
              <HomeProductStage />
            </div>
          </div>

          <div className="editorial-wrap home-pair">
            <div>
              <h2 className="home-pair-title font-serif">
                Voicemail loses jobs. Orvius doesn&apos;t.
              </h2>
              <p className="home-pair-body font-sans">
                Every call qualified — service, urgency, address, callback.
                Owner alert on your phone in seconds. The record is written
                before anyone picks up a wrench.
              </p>
              <Link href="/demo" className="editorial-link editorial-link-inline font-sans">
                Hear a call →
              </Link>
            </div>
            <div>
              <h2 className="home-pair-title font-serif">
                Not just answering — running the shop.
              </h2>
              <p className="home-pair-body font-sans">
                Lead becomes customer. Customer becomes job. Job gets a tech.
                Dispatch, inbox, and history in one OS — not a group text and
                a notepad.
              </p>
              <Link href="/pilot" className="editorial-link editorial-link-inline font-sans">
                Apply for free pilot →
              </Link>
            </div>
          </div>
        </section>

        <section className="editorial-section">
          <div className="editorial-wrap editorial-split editorial-split-reverse">
            <HomeOsFrame active="jobs">
              <HomeOsJobs />
            </HomeOsFrame>
            <div className="editorial-copy">
              <p className="home-kicker font-sans">Jobs</p>
              <h2 className="editorial-heading font-serif">
                A lead becomes a job.
              </h2>
              <p className="editorial-body font-sans">
                The same system that answered the phone books the appointment.
                Customers persist. History follows the number. Nothing lives on
                a sticky note.
              </p>
              <Link href="/pilot" className="editorial-link editorial-link-inline font-sans">
                Start free pilot →
              </Link>
            </div>
          </div>
        </section>

        <section className="editorial-section editorial-section-muted">
          <div className="editorial-wrap editorial-split">
            <div className="editorial-copy">
              <p className="home-kicker font-sans">Field</p>
              <h2 className="editorial-heading font-serif">
                The board is the day.
              </h2>
              <p className="editorial-body font-sans">
                Who goes where. En route, on site, complete. Dispatch runs from
                one board — not a group text.
              </p>
              <Link href="/pilot" className="editorial-link editorial-link-inline font-sans">
                Start free pilot →
              </Link>
            </div>
            <HomeOsFrame active="dispatch">
              <HomeOsDispatch />
            </HomeOsFrame>
          </div>
        </section>

        <section className="editorial-section">
          <div className="editorial-wrap editorial-split editorial-split-reverse">
            <HomeOsFrame active="ask">
              <HomeOsAsk />
            </HomeOsFrame>
            <div className="editorial-copy">
              <p className="home-kicker font-sans">Ask</p>
              <h2 className="editorial-heading font-serif">
                The shop has a memory.
              </h2>
              <p className="editorial-body font-sans">
                Ask answers from your calls, customers, jobs, and dispatch —
                not the internet. Your data. Your shop.
              </p>
              <Link href="/pilot" className="editorial-link editorial-link-inline font-sans">
                Start free pilot →
              </Link>
            </div>
          </div>
        </section>

        <section className="editorial-section editorial-section-muted">
          <div className="editorial-wrap">
            <p className="home-kicker font-sans">Why shops switch</p>
            <h2 className="editorial-heading font-serif">
              Beats voicemail. Beats bolt-on AI.
            </h2>
            <div className="home-trio">
              <article className="home-trio-card">
                <h3 className="home-trio-title font-serif">Always on</h3>
                <p className="home-trio-body font-sans">
                  Nights, weekends, peak season. The phone gets answered when
                  you&apos;re under a house.
                </p>
              </article>
              <article className="home-trio-card">
                <h3 className="home-trio-title font-serif">One record</h3>
                <p className="home-trio-body font-sans">
                  Call, customer, job, technician. Not Smith.ai taking a message
                  while your CRM stays empty.
                </p>
              </article>
              <article className="home-trio-card">
                <h3 className="home-trio-title font-serif">Live this week</h3>
                <p className="home-trio-body font-sans">
                  No six-month ServiceTitan rollout. We onboard you personally.
                  Thirty days free.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="editorial-statement">
          <div className="editorial-wrap">
            <p className="home-kicker home-kicker-on-void font-sans">In production</p>
            <p className="editorial-quote font-serif">
              Summit HVAC runs on Orvius.
            </p>
            <p className="editorial-quote-sub font-sans">
              Emergencies, same-day requests, and after-hours calls — handled
              without a receptionist on payroll.
            </p>
            <Link href="/demo" className="editorial-link-on-void font-sans">
              Hear a call →
            </Link>
          </div>
        </section>

        <HomeChangelog />

        <section className="editorial-close">
          <div className="editorial-wrap home-close">
            <BrandIntro
              kicker="Start now"
              title="Never miss a call again."
              description={`Free ${pricing.pilot.period}. Then $${pricing.pro.price}/mo — one booked job covers the month.`}
            />
            <HomeHeroActions />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
