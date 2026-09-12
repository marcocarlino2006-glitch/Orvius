import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company, osRings } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Product",
  description: `${company.productName} — the night-shift OS for the trades. Answer, book, alert, dispatch, and prove it — one record.`,
};

const liveLoop = [
  {
    id: "01",
    title: "Answer and qualify.",
    body: "After-hours and overflow calls get answered and qualified. Emergencies escalate; estimates land as leads.",
  },
  {
    id: "02",
    title: "Alert the owner.",
    body: "A clean summary hits the owner’s phone in seconds — so the night job does not wait for morning voicemail.",
  },
  {
    id: "03",
    title: "Book into one record.",
    body: "Priority work can auto-book. Every call and text compounds the same customer record — no CRM scavenger hunt.",
  },
] as const;

const expanding = [
  {
    title: "Dispatch",
    body: "Assign techs by SMS job links. Crew rows are field tools — not extra dashboard seats.",
  },
  {
    title: "Money",
    body: "Draft estimates and invoices on the job; record payments manually. Public card (when Stripe is live) settles on Orvius until Connect — not the shop bank.",
  },
  {
    title: "Proof",
    body: "Weekly recovered jobs and dollars copy as a stamped artifact the owner can trust.",
  },
] as const;

export default function ProductPage() {
  const liveRing = osRings.find((r) => r.status === "live");

  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Product"
            title="Night shift first. Shop OS next."
            subline="Not an AI receptionist bolted onto a CRM."
            description="Orvius answers after-hours and overflow, alerts the owner, and compounds one record — then expands into the shop OS when the wedge is proven."
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap">
          <p className="tier1-eyebrow type-eyebrow">
            Live today{liveRing ? ` · ${liveRing.name}` : ""}
          </p>
          <h2 className="tier1-section-title type-headline">
            The night-shift loop.
          </h2>
          <p className="tier1-section-lead font-sans max-w-2xl">
            Master this on a real line before the rest of the OS matters.
          </p>
          <ol className="mkt-laws mkt-laws--meta font-sans mt-8">
            {liveLoop.map((c) => (
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
        <div className="editorial-wrap">
          <p className="tier1-eyebrow type-eyebrow">Expanding next</p>
          <h2 className="tier1-section-title type-headline">
            One record. More rings.
          </h2>
          <p className="tier1-section-lead font-sans max-w-2xl">
            Shipping in order — never as vapor features ahead of the wedge.
          </p>
          <ul className="tier1-strategy-list font-sans mt-6">
            {expanding.map((item) => (
              <li key={item.title}>
                <strong>{item.title}.</strong> {item.body}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="tier1-story">
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
