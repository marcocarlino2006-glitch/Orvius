import Link from "next/link";
import { MktSection, MktSectionHeader } from "@/components/mkt-section";
import { getPlanById } from "@/lib/pricing-plans";

const live = [
  { title: "Live AI line", detail: "Answer, qualify, alert" },
  { title: "Jobs from calls", detail: "Transcripts + summaries" },
  { title: "Dispatch board", detail: "One command center" },
  { title: "Ask Orvius", detail: "What needs attention today" },
  { title: "Sendable estimates", detail: "Accept, card, or manual pay" },
  { title: "Approve-first queue", detail: "Propose → you OK → execute" },
  { title: "Tech field link", detail: "SMS → confirm → en route → done" },
] as const;

const next = [
  { title: "Stripe Connect", detail: "Card pay straight to the shop" },
  { title: "Pricebook + capacity", detail: "Quote from real inventory" },
  { title: "Weekly proof autopilot", detail: "Economics to the owner" },
] as const;

export function HomeOsPath() {
  return (
    <MktSection id="path" tone="inset" aria-labelledby="home-path-heading" className="mkt-mastery-section">
      <MktSectionHeader
        kicker="Build status"
        title="Shipped. Next. Never vapor."
        lead="Buy the closed loop that works today. Next is labeled — never dressed as live."
        titleId="home-path-heading"
      />

      <div className="mkt-path-grid mkt-path-grid--mastery">
        <article className="mkt-path-card mkt-path-card--live mkt-path-card--mastery">
          <div className="mkt-path-head">
            <p className="mkt-path-label">Live today</p>
            <span className="mkt-path-pill mkt-path-pill-live">Available now</span>
          </div>
          <ul className="mkt-path-list mkt-path-list--mastery font-sans">
            {live.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="mkt-path-card mkt-path-card--next mkt-path-card--mastery">
          <div className="mkt-path-head">
            <p className="mkt-path-label">Building next</p>
            <span className="mkt-path-pill">Not required to start</span>
          </div>
          <ul className="mkt-path-list mkt-path-list--mastery font-sans">
            {next.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </MktSection>
  );
}

export function HomePlanTruth() {
  const line = getPlanById("line");
  const pro = getPlanById("pro");

  return (
    <MktSection id="plans" tone="light" className="mkt-mastery-section">
      <MktSectionHeader
        kicker="Access"
        title="Enter on the line. Own the OS."
        lead="Every plan includes the live AI line — Law I. Pro is the command plane."
      />

      <div className="mkt-plans-grid mkt-plans-grid--mastery">
        <article className="mkt-plan-card mkt-plan-card--mastery">
          <p className="mkt-plan-name">{line.name}</p>
          <p className="mkt-plan-price">
            ${line.price}
            <span>/mo</span>
          </p>
          <p className="mkt-plan-desc font-sans">Front door only — the AI phone line</p>
          <ul className="mkt-plan-list font-sans">
            <li>Answers when you&apos;re on a job or after hours</li>
            <li>Call transcripts and summaries</li>
            <li>Email / SMS owner alerts</li>
          </ul>
          <p className="mkt-plan-gap font-sans">No jobs board · no dispatch · no Ask</p>
          <Link href="/pricing" className="mkt-btn mkt-btn-secondary mkt-btn-block mkt-btn-hero">
            Start with Line
          </Link>
        </article>

        <article className="mkt-plan-card mkt-plan-card--featured mkt-plan-card--mastery">
          <p className="mkt-plan-badge">Most shops</p>
          <p className="mkt-plan-name">{pro.name}</p>
          <p className="mkt-plan-price">
            ${pro.price}
            <span>/mo</span>
          </p>
          <p className="mkt-plan-desc font-sans">Full command center — line + day operations</p>
          <ul className="mkt-plan-list font-sans">
            <li>Everything in Line</li>
            <li>Jobs, dispatch, and attention queue</li>
            <li>Ask: plain-language shop memory</li>
            <li>Estimates, invoices, and manual payments</li>
          </ul>
          <p className="mkt-plan-gap mkt-plan-gap-pro font-sans">The OS shops operate from</p>
          <Link href="/pilot" className="mkt-btn mkt-btn-ink mkt-btn-block mkt-btn-hero">
            Start with Pro
          </Link>
        </article>
      </div>

      <p className="mkt-plans-foot font-sans">
        <Link href="/pricing">Compare plans</Link>
        {" · "}
        <Link href="/pilot">Book a live call audit</Link>
        {" · "}
        Prices subject to change; see Terms.
      </p>
    </MktSection>
  );
}
