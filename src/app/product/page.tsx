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
    title: "Answer the call.",
    body: "Inbound after-hours and overflow calls are answered — no voicemail graveyard.",
  },
  {
    id: "02",
    title: "Understand and capture.",
    body: "Problem, urgency, service address, and callback — structured for the shop, not a transcript dump.",
  },
  {
    id: "03",
    title: "Book, confirm, alert.",
    body: "Propose a window, text the customer to confirm, notify the owner. Escalate when confidence is low.",
  },
  {
    id: "04",
    title: "Prove call → cash.",
    body: "Track demand captured, appointments booked, jobs completed, and revenue influenced — so the pilot pays.",
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
            subline="Overflow and after-hours first — answer, qualify, book, confirm, alert, escalate."
            description="The beginning is not the full OS. It is proving one shop will pay Orvius to turn one customer call into one completed, paid job."
            actions={
              <>
                <a href={demoLineHref()} className="ov-btn ov-btn--solid">
                  Call the live line
                </a>
                <Link href="/pilot" className="ov-btn ov-btn--quiet">
                  Request a demo
                </Link>
              </>
            }
          />
          <div className="ov-product-stage">
            <div className="ov-stage-world" aria-hidden>
              <video
                className="ov-stage-world-video"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                poster="/marketing/stage-world.svg"
              >
                <source src="/marketing/stage-world.mp4" type="video/mp4" />
              </video>
              <span className="ov-stage-world-haze" />
              <span className="ov-stage-world-land" />
            </div>
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
              Dial the live product, or book a controlled pilot audit for your HVAC shop.
            </p>
          </div>
          <div className="tier1-actions">
            <a href={demoLineHref()} className="ov-btn ov-btn--solid">
              Call the live line
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
