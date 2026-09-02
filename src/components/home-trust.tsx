import Link from "next/link";
import { trustBadges } from "@/lib/trust";
import { MktSection } from "@/components/mkt-section";

const controls = [
  {
    title: "Unsure → human",
    body: "Missing address, unclear urgency, or low confidence — flagged for review, not guessed.",
  },
  {
    title: "Audit trail",
    body: "Calls, transcripts, summaries, and actions on the shop record.",
  },
  {
    title: "Owner in control",
    body: "You set hours and services. High-risk moves stay approve-first.",
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
            <li key={item.title} className="mkt-trust-item mkt-trust-item-light">
              <h3 className="mkt-trust-title">{item.title}</h3>
              <p className="mkt-trust-body">{item.body}</p>
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
