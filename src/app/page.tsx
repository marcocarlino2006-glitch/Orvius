import {
  CallTranscriptProof,
  OwnerAlertCard,
} from "@/components/owner-alert-card";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import { ProfileMenu } from "@/components/profile-menu";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orvius — The AI operating partner for service businesses",
  description:
    "Orvius is the AI operating partner for HVAC, plumbing, and electrical businesses. Every call answered. Every lead captured.",
  openGraph: {
    title: "Orvius — AI operating partner for service businesses",
    description:
      "The front door of your business — always answered. Built for home service operators.",
  },
};

export default function HomePage() {
  return (
    <>
      <ShellHeader plane="chalk" cta={false} />

      <main className="editorial bg-chalk text-void">
        {/* Hero — one idea, maximum space */}
        <section className="editorial-hero">
          <div className="editorial-wrap">
            <h1 className="editorial-display font-serif">
              The AI operating partner for service businesses.
            </h1>
            <p className="editorial-lead font-sans">
              Every call answered. Every lead qualified. Every owner alerted —
              for {company.trades.join(", ")}, and the shops that depend on
              them.
            </p>
            <div className="editorial-actions font-sans">
              <Link href="/pilot" className="editorial-cta">
                Start free pilot
              </Link>
              <Link href="/demo" className="editorial-link">
                Hear a demo call
              </Link>
            </div>
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

        {/* Close — quiet confidence */}
        <section className="editorial-close">
          <div className="editorial-wrap editorial-close-inner">
            <p className="editorial-close-text font-serif">
              Built for the long run.
            </p>
            <div className="editorial-actions font-sans">
              <Link href="/pilot" className="editorial-cta">
                Apply for free pilot
              </Link>
              <Link href="/pricing" className="editorial-link">
                Pricing
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
