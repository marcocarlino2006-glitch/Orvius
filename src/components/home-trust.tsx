import Link from "next/link";
import { trustBadges } from "@/lib/trust";
import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const controls = [
  {
    title: "Unsure → human",
    body: "Low confidence gets flagged — not guessed.",
  },
  {
    title: "Full audit trail",
    body: "Calls, transcripts, actions on the shop record.",
  },
  {
    title: "Owner in control",
    body: "Your hours, your services. Approve-first on risk.",
  },
] as const;

export function HomeTrust() {
  return (
    <MktSection tone="inset" aria-labelledby="home-trust-heading">
      <MktSectionHeader
        kicker="Trust"
        title="Your data. Your rules."
        titleId="home-trust-heading"
      />

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
        <Link href="/sms-terms">SMS</Link>
      </p>
    </MktSection>
  );
}
