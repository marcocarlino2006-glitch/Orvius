import Link from "next/link";
import { trustBadges } from "@/lib/trust";
import { MktSection } from "@/components/mkt-section";

const controls = [
  {
    title: "Unsure → human",
    body: "Missing address, unclear urgency, or low confidence — flagged for review, not guessed.",
    ui: (
      <div className="mkt-trust-ui">
        <div className="mkt-trust-meter">
          <span>Confidence</span>
          <strong>42%</strong>
        </div>
        <div className="mkt-trust-meter-track" aria-hidden>
          <span style={{ width: "42%" }} />
        </div>
        <p className="mkt-trust-ui-state">Handoff queued · owner notified</p>
      </div>
    ),
  },
  {
    title: "Audit trail",
    body: "Calls, transcripts, summaries, and actions on the shop record.",
    ui: (
      <ul className="mkt-trust-log">
        <li>
          <span>2:01</span> Job booked
        </li>
        <li>
          <span>1:18</span> Owner SMS sent
        </li>
        <li>
          <span>0:42</span> Urgency: emergency
        </li>
      </ul>
    ),
  },
  {
    title: "Owner in control",
    body: "You set hours and services. High-risk moves stay approve-first.",
    ui: (
      <div className="mkt-trust-approve">
        <p>Send SMS to caller?</p>
        <div>
          <span className="mkt-trust-approve-yes">Approve</span>
          <span className="mkt-trust-approve-no">Hold</span>
        </div>
      </div>
    ),
  },
];

export function HomeTrust() {
  return (
    <MktSection tone="light" aria-labelledby="home-trust-heading" className="mkt-mastery-section">
      <div className="mkt-trust-editorial mkt-trust-editorial--mastery">
        <div className="mkt-trust-intro">
          <p className="mkt-eyebrow font-sans">Control plane</p>
          <h2 id="home-trust-heading" className="mkt-section-title">
            Autonomy with hard overrides.
          </h2>
          <p className="mkt-section-lead font-sans">
            Mechanisms in the product — not trust theater. Full detail in the trust center.
          </p>
        </div>

        <ul className="mkt-trust-grid mkt-trust-grid--mastery font-sans">
          {controls.map((item) => (
            <li key={item.title} className="mkt-trust-card mkt-trust-card--mastery">
              <div className="mkt-trust-card-copy">
                <h3 className="mkt-trust-title">{item.title}</h3>
                <p className="mkt-trust-body">{item.body}</p>
              </div>
              <div className="mkt-trust-card-ui">{item.ui}</div>
            </li>
          ))}
        </ul>

        <ul className="mkt-signal-strip mkt-signal-strip--mastery font-sans">
          {trustBadges.map((badge) => (
            <li key={badge.label}>
              <strong>{badge.label}</strong>
              <span>{badge.detail}</span>
            </li>
          ))}
        </ul>

        <p className="mkt-trust-links font-sans">
          <Link href="/security">Trust center · Security</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/sms-terms">SMS terms</Link>
        </p>
      </div>
    </MktSection>
  );
}
