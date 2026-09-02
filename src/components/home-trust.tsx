import Link from "next/link";
import { trustBadges } from "@/lib/trust";

const controls = [
  {
    title: "Unsure → human",
    body: "When the AI lacks address, urgency, or confidence, Orvius flags the lead for review and escalates — it does not guess on emergencies.",
  },
  {
    title: "Audit trail",
    body: "Calls, transcripts, summaries, and actions stay on the shop record. You can see what happened and who was notified.",
  },
  {
    title: "Owner in control",
    body: "You set hours, services, and alerts. High-risk moves — assign, SMS follow-up, booking changes — stay approve-first where it matters.",
  },
] as const;

/** Trust for emergency + PII handling — surfaced on the homepage, not only legal. */
export function HomeTrust() {
  return (
    <section className="home-trust" aria-labelledby="home-trust-heading">
      <div className="editorial-wrap">
        <p className="tier1-eyebrow type-eyebrow">Trust</p>
        <h2 id="home-trust-heading" className="tier1-section-title type-headline">
          Emergencies and customer data stay under your control.
        </h2>
        <p className="tier1-section-lead font-sans">
          Orvius handles phone numbers, addresses, and scheduling. When it is
          unsure, a human takes over. You keep the record.
        </p>

        <ul className="home-trust-controls font-sans">
          {controls.map((item) => (
            <li key={item.title} className="home-trust-control">
              <h3 className="home-trust-control-title">{item.title}</h3>
              <p className="home-trust-control-body">{item.body}</p>
            </li>
          ))}
        </ul>

        <ul className="home-trust-badges font-sans">
          {trustBadges.map((badge) => (
            <li key={badge.label}>
              <strong>{badge.label}</strong>
              <span>{badge.detail}</span>
            </li>
          ))}
        </ul>

        <p className="home-trust-links font-sans">
          <Link href="/security">Security</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/sms-terms">SMS terms</Link>
          <a href="mailto:hello@orvius.im">Support</a>
        </p>
      </div>
    </section>
  );
}
