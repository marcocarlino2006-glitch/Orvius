import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Enterprise",
  description: `${company.productName} for multi-shop HVAC operators — after one location proves call→cash.`,
};

const pillars = [
  {
    id: "01",
    title: "Prove one location first.",
    body: "Start with one live overflow/after-hours line. Expand only after calls become booked, completed, paid work.",
  },
  {
    id: "02",
    title: "Align hours, services, escalation.",
    body: "Document each shop’s services, hours, escalation rules, and capacity before software proposes windows across the footprint.",
  },
  {
    id: "03",
    title: "Every location, one sign-in.",
    body: "Owners, managers, and dispatchers each get the access their job needs, and anyone running several shops switches between them from one account. Every access change is recorded. Consolidated billing and cross-location reporting are set up with you per deal.",
  },
] as const;

export default function EnterprisePage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Enterprise"
            title="One standard after one shop pays."
            subline="For franchises and multi-shop HVAC operators who want overflow covered without platform vapor."
            description={`${company.productName} earns multi-location only after a single site proves demand → completed work → money. We set the footprint up with you.`}
            actions={
              <>
                <a
                  href="mailto:hello@orvius.im?subject=Enterprise%20%E2%80%94%20multi-shop%20HVAC"
                  className="ov-btn ov-btn--solid"
                >
                  Contact sales
                </a>
                <Link href="/pricing" className="ov-btn ov-btn--quiet">
                  View pricing
                </Link>
              </>
            }
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap">
          <ol className="mkt-laws mkt-laws--ruled font-sans">
            {pillars.map((c) => (
              <li key={c.id} className="mkt-law mkt-law--ruled">
                <span className="mkt-law-index" aria-hidden>
                  {c.id}
                </span>
                <div className="mkt-law-copy">
                  <h2 className="mkt-law-title">{c.title}</h2>
                  <p className="mkt-law-body">{c.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap tier1-story-grid">
          <div>
            <h2 className="tier1-section-title type-headline">
              Talk through your footprint.
            </h2>
            <p className="tier1-section-lead font-sans">
              Multi-shop pricing is custom. Tell us how many HVAC locations you
              run and we&apos;ll set the standard up with you.
            </p>
          </div>
          <div className="tier1-actions">
            <a
              href="mailto:hello@orvius.im?subject=Enterprise%20%E2%80%94%20multi-shop%20HVAC"
              className="ov-btn ov-btn--solid"
            >
              Contact sales
            </a>
            <Link href="/pilot" className="ov-btn ov-btn--quiet">
              Request a demo
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
