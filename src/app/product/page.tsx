import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Product",
  description: `${company.productName} — the night-shift OS for the trades. Answer, book, alert, dispatch, and prove it — one record.`,
};

const capabilities = [
  {
    id: "01",
    title: "Answer, qualify, alert.",
    body: "After-hours and overflow calls are answered, structured into a service request, and sent to the owner through the configured alert path.",
  },
  {
    id: "02",
    title: "One board. One record.",
    body: "Every call, text, job, confirmation, and recorded outcome stays on one customer record. Book and assign from Attention.",
  },
  {
    id: "03",
    title: "Dispatch and money.",
    body: "Propose capacity-aware windows, assign techs by SMS, and export captured-demand bookings with estimated value as a stamped weekly artifact.",
  },
] as const;

export default function ProductPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Product"
            title="One system for every call, customer, and job."
            subline="The front desk and the operational record stay connected."
            description="Orvius answers after-hours calls, captures the request, proposes an open window, alerts the owner, and keeps the resulting work on one record."
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap">
          <ol className="mkt-laws mkt-laws--meta font-sans">
            {capabilities.map((c) => (
              <li key={c.id} className="mkt-law">
                <span className="mkt-law-id" aria-hidden>
                  {c.id}
                </span>
                <div className="mkt-law-copy">
                  <h3 className="mkt-law-title">{c.title}</h3>
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
              See it on a real line.
            </h2>
            <p className="tier1-section-lead font-sans">
              Call the live AI, or audit what happens to your own unanswered traffic.
            </p>
          </div>
          <div className="tier1-actions">
            <a href="tel:+18446439170" className="inst-btn inst-btn-ghost">
              Call the live AI
            </a>
            <Link href="/pilot" className="inst-btn inst-btn-primary">
              Book a call audit
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
