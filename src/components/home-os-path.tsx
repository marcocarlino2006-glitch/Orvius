import Link from "next/link";
import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const live = [
  "Live AI line — answer, qualify, alert",
  "Calls become jobs with transcripts and summaries",
  "Dispatch from one command center",
  "Ask Orvius what needs attention today",
  "Estimates, invoices, and manual payments",
];

const next = [
  "Copilot that proposes actions you approve",
  "Skills for travel, maps, and shop workflows",
  "Stripe Connect for card payments",
];

export function HomeOsPath() {
  return (
    <MktSection id="path" tone="inset" aria-labelledby="home-path-heading">
      <MktSectionHeader
        kicker="Product truth"
        title="What is live. What is next."
        lead="Buy what works today. The roadmap is honest — and visually separate so it never pretends to be shipping."
        titleId="home-path-heading"
      />

      <div className="mkt-path-grid">
        <article className="mkt-path-card mkt-path-card--live">
          <div className="mkt-path-head">
            <p className="mkt-path-label">Live today</p>
            <span className="mkt-path-pill mkt-path-pill-live">Available now</span>
          </div>
          <ul className="mkt-path-list font-sans">
            {live.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="mkt-path-card mkt-path-card--next">
          <div className="mkt-path-head">
            <p className="mkt-path-label">Building next</p>
            <span className="mkt-path-pill">Not required to start</span>
          </div>
          <ul className="mkt-path-list font-sans">
            {next.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </div>
    </MktSection>
  );
}

export function HomePlanTruth() {
  return (
    <MktSection id="plans" tone="light">
      <MktSectionHeader
        kicker="Pricing"
        title="Start with the line. Grow into the full OS."
        lead="Every plan includes the live AI line. Pro adds the command center shops run the day from — the gap is obvious."
      />

      <div className="mkt-plans-grid">
        <article className="mkt-plan-card">
          <p className="mkt-plan-name">Line</p>
          <p className="mkt-plan-price">
            $99<span>/mo</span>
          </p>
          <p className="mkt-plan-desc font-sans">Front door only — the AI phone line</p>
          <ul className="mkt-plan-list font-sans">
            <li>Answers when you&apos;re on a job or after hours</li>
            <li>Call transcripts and summaries</li>
            <li>Email / SMS owner alerts</li>
          </ul>
          <p className="mkt-plan-gap font-sans">No jobs board · no dispatch · no Ask</p>
          <Link href="/signup?plan=line" className="mkt-btn mkt-btn-secondary mkt-btn-block mkt-btn-pill">
            Start with Line
          </Link>
        </article>

        <article className="mkt-plan-card mkt-plan-card--featured">
          <p className="mkt-plan-badge">Recommended for most shops</p>
          <p className="mkt-plan-name">Pro</p>
          <p className="mkt-plan-price">
            $249<span>/mo</span>
          </p>
          <p className="mkt-plan-desc font-sans">Full command center — line + day operations</p>
          <ul className="mkt-plan-list font-sans">
            <li>Everything in Line</li>
            <li>Jobs, dispatch, and attention queue</li>
            <li>Ask: plain-language shop memory</li>
            <li>Estimates, invoices, and manual payments</li>
          </ul>
          <p className="mkt-plan-gap mkt-plan-gap-pro font-sans">The OS shops operate from</p>
          <Link href="/signup?plan=pro" className="mkt-btn mkt-btn-ink mkt-btn-block mkt-btn-pill">
            Start with Pro
          </Link>
        </article>
      </div>

      <p className="mkt-plans-foot font-sans">
        <Link href="/pricing">Compare plans</Link>
        {" · "}
        <Link href="/pilot">Book a live call audit</Link>
      </p>
    </MktSection>
  );
}
