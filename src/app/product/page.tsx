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
    body: "After-hours and overflow calls get answered, qualified, and the owner is alerted in seconds — demand never dies on voicemail.",
  },
  {
    id: "02",
    title: "One board. One record.",
    body: "Every call, text, and job compounds a single customer record. Book and assign from Attention — no CRM scavenger hunt.",
  },
  {
    id: "03",
    title: "Dispatch and money.",
    body: "Auto-book to the dispatch board, assign techs by SMS, and prove recovered jobs and dollars as a stamped weekly artifact.",
  },
] as const;

export default function ProductPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Product"
            title="Night shift first. Shop OS next."
            subline="Not an AI receptionist bolted onto a CRM."
            description="Orvius answers after-hours and overflow, alerts the owner, and compounds one record — then expands into the shop OS."
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
              Run a demo call in the browser, or prove it on your own number.
            </p>
          </div>
          <div className="tier1-actions">
            <Link href="/demo" className="inst-btn inst-btn-ghost">
              Run a demo
            </Link>
            <Link href="/pilot" className="inst-btn inst-btn-primary">
              Prove it on your line
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
