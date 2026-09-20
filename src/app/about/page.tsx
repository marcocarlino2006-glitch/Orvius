import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import { workspaceAccessPublicClaim } from "@/lib/seats";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: `${company.productName} — ${company.categoryClaim} ${company.proofLine}`,
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label={company.productName}
            title={company.tagline}
            subline={company.proofLine}
            description={company.categoryClaim}
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap max-w-3xl">
          <h2 className="tier1-section-title type-headline">
            Missed and after-hours calls become booked work.
          </h2>
          <p className="tier1-section-lead font-sans">
            Orvius answers when your crew cannot — after hours and overflow —
            captures the request, proposes an open service window, texts the
            customer to confirm, and alerts you. One shop record for the call,
            the lead, and the job.
          </p>
          <ul className="tier1-strategy-list font-sans">
            <li>Answers after-hours and overflow on your Orvius line</li>
            <li>Captures name, phone, service, urgency, and address</li>
            <li>Proposes a window and texts for confirmation</li>
            <li>Alerts the owner and keeps one operational record</li>
          </ul>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap max-w-3xl">
          <h2 className="tier1-section-title type-headline">
            For {company.trades.join(", ")}.
          </h2>
          <p className="tier1-section-lead font-sans">
            Built by {company.legalName}. We claim only what the line closes
            today — capture, qualify, alert, book — and expand the shop record
            when that loop is airtight.
          </p>
          <p className="tier1-section-lead font-sans">
            {workspaceAccessPublicClaim()}
          </p>
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap tier1-story-grid">
          <div>
            <h2 className="tier1-section-title type-headline">{company.legalName}</h2>
            <p className="tier1-section-lead font-sans">
              Contracts and subscriptions are with {company.legalName}.{" "}
              {company.productName} is the product brand.
            </p>
          </div>
          <div className="tier1-actions">
            <Link href="/pricing" className="ov-btn ov-btn--solid">
              View pricing
            </Link>
            <Link href="/pilot" className="ov-btn ov-btn--quiet">
              Book a live audit
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
