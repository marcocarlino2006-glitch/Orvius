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
        <section className="editorial-hero">
          <div className="editorial-wrap">
            <h1 className="editorial-display font-serif">{company.tagline}</h1>
            <p className="editorial-lead font-sans">
              Every call answered. Every customer remembered. Built for{" "}
              {company.trades.join(", ")} — live in the field today.
            </p>
            <HomeHeroActions />
          </div>
        </section>

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

        <section className="editorial-section">
          <div className="editorial-wrap">
            <h2 className="editorial-heading font-serif">The full system.</h2>
            <p className="editorial-body font-sans max-w-2xl">
              Orvius is not a feature. It is the operating system your shop runs
              on — built one layer at a time, starting with the front door.
            </p>
            <div className="mt-12">
              <OsRings limit={4} />
            </div>
            <Link href="/about" className="editorial-link editorial-link-inline font-sans">
              About Orvius →
            </Link>
          </div>
        </section>

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
