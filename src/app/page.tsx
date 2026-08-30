import { HomeChangelog } from "@/components/home-changelog";
import { HomeHeroActions } from "@/components/home-hero-actions";
import {
  HomeOsAsk,
  HomeOsCall,
  HomeOsDispatch,
  HomeOsFrame,
  HomeOsJobs,
  HomeProductStage,
} from "@/components/home-product-stage";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orvius — The operating system for service businesses",
  description:
    "The system of record for HVAC, plumbing, and electrical. Every call, every customer, every job.",
  openGraph: {
    title: "Orvius — " + company.tagline,
    description:
      "The system of record for the trades. One operating system — starting at the front door.",
  },
};

export default function HomePage() {
  return (
    <>
      <ShellHeader plane="chalk" cta={{ href: "/login", label: "Sign in" }} />

      <main className="editorial home-page bg-chalk text-void">
        <section className="home-hero">
          <div className="editorial-wrap home-hero-copy">
            <h1 className="home-display font-serif">{company.tagline}</h1>
            <p className="home-lead font-sans">
              The system of record for HVAC, plumbing, and electrical. Every
              call, every customer, every job — one operating system.
            </p>
            <HomeHeroActions />
          </div>
          <div className="home-hero-stage">
            <div className="editorial-wrap">
              <HomeProductStage />
            </div>
          </div>
        </section>

        <section className="editorial-section">
          <div className="editorial-wrap editorial-split">
            <div className="editorial-copy">
              <p className="home-kicker font-sans">Front door</p>
              <h2 className="editorial-heading font-serif">
                Every inbound line, answered.
              </h2>
              <p className="editorial-body font-sans">
                Orvius takes the call, qualifies the work, and writes the
                record. The owner gets a clean alert — on the job, after hours,
                or at peak season. The front door does not go to voicemail.
              </p>
            </div>
            <HomeOsFrame active="call">
              <HomeOsCall />
            </HomeOsFrame>
          </div>
        </section>

        <section className="editorial-section editorial-section-muted">
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
            </div>
          </div>
        </section>

        <section className="editorial-section">
          <div className="editorial-wrap editorial-split">
            <div className="editorial-copy">
              <p className="home-kicker font-sans">Field</p>
              <h2 className="editorial-heading font-serif">
                The board is the day.
              </h2>
              <p className="editorial-body font-sans">
                Who goes where. En route, on site, complete. Dispatch runs from
                one board — not a group text. The field is a layer of the OS.
              </p>
            </div>
            <HomeOsFrame active="dispatch">
              <HomeOsDispatch />
            </HomeOsFrame>
          </div>
        </section>

        <section className="editorial-section editorial-section-muted">
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
                Ask answers from the records already in the OS — calls, customers,
                jobs, dispatch. Not a chatbot. A mouth on the system of record.
              </p>
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
              without a receptionist on payroll. Live line{" "}
              <span className="tabular-nums text-chalk">+1 844 643 9170</span>.
            </p>
            <Link href="/demo" className="editorial-link-on-void font-sans">
              Hear a call →
            </Link>
          </div>
        </section>

        <HomeChangelog />

        <section className="editorial-section editorial-section-muted">
          <div className="editorial-wrap home-company">
            <p className="home-kicker font-sans">Company</p>
            <p className="home-company-line font-serif">
              Orvius is building the operating system for the trades.
            </p>
            <p className="editorial-body font-sans">
              We start at the front door and expand one ring at a time. A
              product of {company.legalName}.
            </p>
            <Link href="/about" className="editorial-link editorial-link-inline font-sans">
              About Orvius →
            </Link>
          </div>
        </section>

        <section className="editorial-close">
          <div className="editorial-wrap editorial-close-inner">
            <p className="editorial-close-text font-serif">
              {company.tagline}
            </p>
            <div className="editorial-actions font-sans" style={{ marginTop: 0 }}>
              <Link href="/login" className="editorial-cta">
                Sign in
              </Link>
              <Link href="/pilot" className="editorial-link">
                Apply for pilot
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
