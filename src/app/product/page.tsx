import { HomeLiveCall } from "@/components/home-live-call";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { StageWorld } from "@/components/stage-world";
import { company } from "@/lib/company";
import { demoLineHref } from "@/lib/demo-line";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Product",
  description: `${company.productName} — ${company.categoryClaim} ${company.proofLine}`,
};

const steps = [
  {
    id: "01",
    title: "Answer every call.",
    body: "After-hours and overflow calls are answered in your shop's name, in English or Spanish. Gas, carbon monoxide and smoke calls get safety instructions first.",
  },
  {
    id: "02",
    title: "Capture the job.",
    body: "Problem, urgency, address and callback go on the customer record as the caller says them, not into a transcript you have to read.",
  },
  {
    id: "03",
    title: "Book, confirm, alert.",
    body: "It offers an open window from your schedule, texts the customer to confirm, and alerts you. A caller who wants a person is transferred to your phone or put on your board for a callback.",
  },
  {
    id: "04",
    title: "See what it earned.",
    body: "Calls answered, jobs booked, jobs completed and money collected, every week, in numbers you can check against your own books.",
  },
] as const;

export default function ProductPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact ov-product-hero">
        <div className="editorial-wrap ov-product-hero-grid">
          <ShellPageIntro
            label="Product"
            title="HVAC receptionist that turns missed calls into paid jobs."
            subline="It answers the calls you can't take, after hours and when every tech is on a job."
            description="It qualifies the caller, books a window, confirms by text and alerts you, so the morning starts with a short list instead of a voicemail box."
            actions={
              <>
                <a href={demoLineHref()} className="ov-btn ov-btn--solid">
                  Call the live line
                </a>
                <Link href="/pilot" className="ov-btn ov-btn--quiet">
                  Book a call audit
                </Link>
              </>
            }
          />
          <div className="ov-product-stage">
            <StageWorld />
            <HomeLiveCall />
          </div>
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap">
          <ol className="mkt-laws mkt-laws--ruled font-sans">
            {steps.map((c) => (
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
              Hear it on a real line.
            </h2>
            <p className="tier1-section-lead font-sans">
              Dial the live line and play a customer, or book a call audit for your shop.
            </p>
          </div>
          <div className="tier1-actions">
            <a href={demoLineHref()} className="ov-btn ov-btn--solid">
              Call the live line
            </a>
            <Link href="/pilot" className="ov-btn ov-btn--quiet">
              Book a call audit
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
