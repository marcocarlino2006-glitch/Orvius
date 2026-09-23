import { MktSection } from "@/components/mkt-section";

const LOOP = [
  "Call",
  "Qualified",
  "Booked or Escalated",
  "Owner alerted",
  "Completed",
  "Paid",
] as const;

const tradeExamples: {
  id: string;
  trade: string;
  badge: string;
  title: string;
  body: string;
}[] = [
  {
    id: "01",
    trade: "HVAC",
    badge: "EXAMPLE IN THE DEMO",
    title: "No-cool after hours",
    body: "Same-day AC language, comfort emergencies, and capacity-aware windows — the live call on this page is an HVAC workflow.",
  },
  {
    id: "02",
    trade: "Plumbing",
    badge: "TRADE RULES",
    title: "Active leak vs. clog",
    body: "Distinguishes water damage risk from routine stoppages, captures shutoff access, and escalates true emergencies to the owner.",
  },
  {
    id: "03",
    trade: "Electrical",
    badge: "TRADE RULES",
    title: "Power out vs. panel work",
    body: "Uses electrical urgency language, flags safety-critical outages, and keeps uncertain calls on the board for a human callback.",
  },
];

/**
 * Shared service loop + mission bridge + short trade examples.
 * Platform is broad; the wedge on the wire stays one clear workflow.
 */
export function HomeStatement() {
  return (
    <MktSection
      tone="light"
      className="mkt-manifesto mkt-manifesto--meta mkt-operating-layer"
      aria-labelledby="home-manifesto-heading"
    >
      <div className="mkt-manifesto-meta">
        <div className="mkt-manifesto-meta-lead">
          <p className="mkt-manifesto-kicker font-sans" data-i18n="rules.kicker">
            How Orvius works
          </p>
          <h2
            id="home-manifesto-heading"
            className="mkt-manifesto-title"
            data-i18n="rules.title"
          >
            One loop for every essential service call.
          </h2>
          <p className="mkt-manifesto-aside font-sans" data-i18n="rules.aside">
            The same path runs for HVAC, plumbing, electrical, and other trades —
            with terminology and emergency rules that match the shop on the line.
          </p>
        </div>

        <ol className="mkt-service-loop font-sans" aria-label="Service call loop">
          {LOOP.map((step, index) => (
            <li key={step} className="mkt-service-loop-step">
              {index > 0 ? (
                <span className="mkt-service-loop-rail" aria-hidden />
              ) : null}
              <span className="mkt-service-loop-label">{step}</span>
            </li>
          ))}
        </ol>

        <p className="mkt-mission-bridge font-sans" data-i18n="rules.mission">
          Starting with the service call, Orvius is building the operating layer
          for the trades that keep the world running.
        </p>

        <ul className="mkt-trade-examples font-sans">
          {tradeExamples.map((example) => (
            <li key={example.id} className="mkt-trade-example">
              <p className="mkt-trade-example-badge">
                <span className="mkt-trade-example-trade">{example.trade}</span>
                <span className="mkt-trade-example-sep" aria-hidden>
                  ·
                </span>
                {example.badge}
              </p>
              <h3 className="mkt-trade-example-title">{example.title}</h3>
              <p className="mkt-trade-example-body">{example.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </MktSection>
  );
}
