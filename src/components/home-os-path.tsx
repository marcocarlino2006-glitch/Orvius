import Link from "next/link";
import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const live = [
  "Live AI line — answer, qualify, alert",
  "Calls → jobs with transcripts",
  "Dispatch command center",
  "Ask what needs attention",
];

const next = [
  "Copilot — propose, you approve",
  "Estimate → invoice → payment",
  "Travel, maps, shop skills",
  "Stripe Connect card payments",
];

export function HomeOsPath() {
  return (
    <MktSection id="path" tone="dark" aria-labelledby="home-path-heading">
      <MktSectionHeader
        light
        kicker="Product"
        title="Live now. Building next."
        titleId="home-path-heading"
      />

      <div className="mkt-path-grid">
        <article className="mkt-path-card mkt-path-card--live mkt-path-card-dark">
          <p className="mkt-path-label">Live</p>
          <ul className="mkt-path-list">
            {live.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="mkt-path-card mkt-path-card-dark">
          <p className="mkt-path-label">Next</p>
          <ul className="mkt-path-list">
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
      <MktSectionHeader kicker="Pricing" title="Line or Pro." />

      <div className="mkt-plans-grid">
        <article className="mkt-plan-card">
          <p className="mkt-plan-name">Line</p>
          <p className="mkt-plan-price">
            $99<span>/mo</span>
          </p>
          <ul className="mkt-plan-list">
            <li>Live AI phone line</li>
            <li>Transcripts + owner alerts</li>
          </ul>
          <Link href="/signup?plan=line" className="mkt-btn mkt-btn-secondary mkt-btn-block">
            Start Line
          </Link>
        </article>

        <article className="mkt-plan-card mkt-plan-card--featured">
          <p className="mkt-plan-badge">Most shops</p>
          <p className="mkt-plan-name">Pro</p>
          <p className="mkt-plan-price">
            $249<span>/mo</span>
          </p>
          <ul className="mkt-plan-list">
            <li>Everything in Line</li>
            <li>Jobs, dispatch, copilot, money</li>
          </ul>
          <Link href="/signup?plan=pro" className="mkt-btn mkt-btn-signal mkt-btn-block">
            Start Pro
          </Link>
        </article>
      </div>

      <p className="mkt-plans-foot">
        <Link href="/pricing">Full comparison</Link>
      </p>
    </MktSection>
  );
}
