import Link from "next/link";
import { trustBadges } from "@/lib/trust";
import { MktSection, MktSectionHeader } from "@/components/mkt-section";

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
    <MktSection tone="dark" aria-labelledby="home-trust-heading">
      <MktSectionHeader
        light
        kicker="Trust"
        title="Emergencies and customer data stay under your control."
        lead="Orvius handles phone numbers, addresses, and scheduling. When it is unsure, a human takes over."
        titleId="home-trust-heading"
      />

      <ul className="mkt-trust-grid font-sans">
        {controls.map((item) => (
          <li key={item.title} className="mkt-trust-item">
            <h3 className="mkt-trust-title">{item.title}</h3>
            <p className="mkt-trust-body">{item.body}</p>
          </li>
        ))}
      </ul>

      <ul className="mkt-trust-badges font-sans">
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
        <a href="mailto:hello@orvius.im">Support</a>
      </p>
    </MktSection>
  );
}
