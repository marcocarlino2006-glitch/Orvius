import Link from "next/link";
import { trustBadges } from "@/lib/trust";
import { MktSection } from "@/components/mkt-section";

const controls = [
  {
    marker: "01",
    title: "Unsure → human",
    body: "Missing address, unclear urgency, or low confidence — flagged for review, not guessed.",
    proof: "Handoff control",
  },
  {
    marker: "02",
    title: "Audit trail",
    body: "Calls, transcripts, summaries, and actions on the shop record.",
    proof: "Full event log",
  },
  {
    marker: "03",
    title: "Owner in control",
    body: "You set hours and services. High-risk moves stay approve-first.",
    proof: "Approve before send",
  },
] as const;

export function HomeTrust() {
  return (
    <MktSection tone="light" aria-labelledby="home-trust-heading">
      <div className="mkt-trust-editorial">
        <div className="mkt-trust-intro">
          <p className="mkt-eyebrow font-sans">Trust</p>
          <h2 id="home-trust-heading" className="mkt-section-title">
            Emergencies and customer data stay under your control.
          </h2>
        </div>

        <ul className="mkt-trust-grid font-sans">
          {controls.map((item) => (
            <li key={item.title} className="mkt-trust-card">
              <span className="mkt-trust-marker">{item.marker}</span>
              <h3 className="mkt-trust-title">{item.title}</h3>
              <p className="mkt-trust-body">{item.body}</p>
              <p className="mkt-trust-proof">{item.proof}</p>
            </li>
          ))}
        </ul>

        <ul className="mkt-signal-strip font-sans">
          {trustBadges.map((badge) => (
            <li key={badge.label}>
              <strong>{badge.label}</strong>
              <span>{badge.detail}</span>
            </li>
          ))}
        </ul>

        <p className="mkt-trust-links font-sans">
          <Link href="/security">Security</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/sms-terms">SMS terms</Link>
        </p>
      </div>
    </MktSection>
  );
}
