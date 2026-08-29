import { HomeHeroActions } from "@/components/home-hero-actions";
import {
  CallTranscriptProof,
  OwnerAlertCard,
} from "@/components/owner-alert-card";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import { OsRings } from "@/components/os-rings";
import { OsProductPreviewSection } from "@/components/os-product-preview";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orvius — The operating system for service businesses",
  description: company.tagline + " Every call answered. Every lead captured.",
  openGraph: {
    title: "Orvius — " + company.tagline,
    description:
      "The front door of your business — always answered. Built for home service operators.",
  },
};

export default function HomePage() {
  return (
    <>
      <ShellHeader plane="chalk" cta={{ href: "/login", label: "Sign in" }} />

      <main className="editorial bg-chalk text-void">
        {/* Hero — one idea, maximum space */}
        <section className="editorial-hero">
          <div className="editorial-wrap">
            <h1 className="editorial-display font-serif">{company.tagline}</h1>
            <p className="editorial-lead font-sans">
              {company.mission} Rings 1–2 are live — front door and customer
              records — for {company.trades.join(", ")}.
            </p>
            <HomeHeroActions />
          </div>
        </section>

        {/* Product — shown, not sold */}
        <section className="editorial-section">
          <div className="editorial-wrap editorial-split">
            <div className="editorial-copy">
              <h2 className="editorial-heading font-serif">
                Your front door, handled.
              </h2>
              <p className="editorial-body font-sans">
                Orvius answers inbound calls and texts, captures service details
                with precision, and sends the owner a clean summary — while
                you&apos;re on the job, after hours, or at peak season.
              </p>
            </div>
            <OwnerAlertCard variant="chalk" className="editorial-card" />
          </div>
        </section>

        {/* Statement — editorial pause */}
        <section className="editorial-statement">
          <div className="editorial-wrap">
            <p className="editorial-quote font-serif">
              Big operators run on intelligence. Small shops still run on missed
              calls.
            </p>
            <p className="editorial-quote-sub font-sans">
              Orvius closes that gap — without hiring, without enterprise
              software bloat.
            </p>
          </div>
        </section>

        {/* Proof — live conversation */}
        <section className="editorial-section editorial-section-muted">
          <div className="editorial-wrap editorial-split editorial-split-reverse">
            <CallTranscriptProof variant="chalk" className="editorial-card" />
            <div className="editorial-copy">
              <h2 className="editorial-heading font-serif">
                Live on real calls today.
              </h2>
              <p className="editorial-body font-sans">
                Summit HVAC runs on Orvius now — emergencies, same-day requests,
                and routine inquiries handled without a receptionist on payroll.
              </p>
              <Link href="/demo" className="editorial-link editorial-link-inline">
                Listen to a demo →
              </Link>
            </div>
          </div>
        </section>

        <OsProductPreviewSection />

        {/* OS — the full system */}
        <section className="editorial-section">
          <div className="editorial-wrap">
            <h2 className="editorial-heading font-serif">The OS.</h2>
            <p className="editorial-body font-sans max-w-2xl">
              Orvius is not a feature. It is the system the shop runs on — one
              ring at a time. We do not skip ahead.
            </p>
            <div className="mt-12">
              <OsRings limit={4} />
            </div>
            <Link href="/about" className="editorial-link editorial-link-inline font-sans">
              Full OS map →
            </Link>
          </div>
        </section>

        {/* Close — quiet confidence */}
        <section className="editorial-close">
          <div className="editorial-wrap editorial-close-inner">
            <p className="editorial-close-text font-serif">
              Built for the long run.
            </p>
            <div className="editorial-actions font-sans">
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
