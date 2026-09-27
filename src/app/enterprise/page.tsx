import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Enterprise",
  description: `${company.productName} for multi-shop HVAC operators: every location side by side, roles for owners, managers and dispatchers, and a record of every change.`,
};

const pillars = [
  {
    id: "01",
    title: "Every location side by side.",
    body: "Calls, leads, booked and completed jobs, money collected, and callers still waiting, per shop, over 7, 30 or 90 days. Sorted so the shop that needs attention is on top.",
  },
  {
    id: "02",
    title: "Roles that match the job.",
    body: "Owners, managers and dispatchers each get the access their job needs. One sign-in switches between every shop it can open.",
  },
  {
    id: "03",
    title: "A record of every change.",
    body: "Settings, team access, jobs, invoices and exports are logged with who made the change and when. Search it, filter it, and download it as CSV.",
  },
  {
    id: "04",
    title: "Rolled out with you.",
    body: "Each shop’s services, hours, service area and escalation rules are set up with you before its line goes live. Billing for several locations is arranged per agreement.",
  },
] as const;

export default function EnterprisePage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Enterprise"
            title="Every location on one board."
            subline="For franchises and multi-shop HVAC operators."
            description="Each shop keeps its own line, hours and rules. You see all of them side by side, with every change recorded."
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
              run and we&apos;ll set them up with you.
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
