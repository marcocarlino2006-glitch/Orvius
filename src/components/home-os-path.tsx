import Link from "next/link";
import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const live = [
  "Live AI line — answer, qualify, alert",
  "Calls become jobs with transcripts and summaries",
  "Dispatch from one command center",
  "Ask Orvius what needs attention today",
];

const next = [
  "Copilot that proposes actions you approve",
  "Estimate → invoice → payment on the job",
  "Skills for travel, maps, and shop workflows",
  "Stripe Connect for card payments",
];

export function HomeOsPath() {
  return (
    <MktSection id="path" tone="inset" aria-labelledby="home-path-heading">
      <MktSectionHeader
        kicker="Product"
        title="Live today vs what we're building next"
        lead="No fake roadmap dates. This is what works now and what's next."
        titleId="home-path-heading"
      />

      <div className="mkt-path-grid">
        <article className="mkt-path-card mkt-path-card--live">
          <p className="mkt-path-label">Live today</p>
          <ul className="mkt-path-list font-sans">
            {live.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="mkt-path-card">
          <p className="mkt-path-label">Building next</p>
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
        lead="Every plan includes the live AI line. Pro adds the command center, copilot, and money workflow."
      />

      <div className="mkt-plans-grid">
        <article className="mkt-plan-card">
          <p className="mkt-plan-name">Line</p>
          <p className="mkt-plan-price">
            $99<span>/mo</span>
          </p>
          <p className="mkt-plan-desc font-sans">Live AI phone line for your shop</p>
          <ul className="mkt-plan-list font-sans">
            <li>Answers when you&apos;re on a job or after hours</li>
            <li>Call transcripts and summaries</li>
            <li>Email alerts for new calls</li>
          </ul>
          <Link href="/signup?plan=line" className="mkt-btn mkt-btn-secondary mkt-btn-block">
            Start with Line
          </Link>
        </article>

        <article className="mkt-plan-card mkt-plan-card--featured">
          <p className="mkt-plan-badge">Most shops start here</p>
          <p className="mkt-plan-name">Pro</p>
          <p className="mkt-plan-price">
            $249<span>/mo</span>
          </p>
          <p className="mkt-plan-desc font-sans">Full command center for your shop</p>
          <ul className="mkt-plan-list font-sans">
            <li>Everything in Line</li>
            <li>Jobs, dispatch, and attention queue</li>
            <li>Copilot with approve-before-send</li>
            <li>Estimates, invoices, and manual payments</li>
          </ul>
          <Link href="/signup?plan=pro" className="mkt-btn mkt-btn-ink mkt-btn-block">
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
