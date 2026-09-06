import { MktSection } from "@/components/mkt-section";

const nightRules = [
  {
    id: "01",
    title: "The bay never goes dark.",
    body: "After-hours and overflow get answered, qualified, and alerted — demand does not die on voicemail.",
  },
  {
    id: "02",
    title: "One board. Not twelve tabs.",
    body: "Every call, text, and job compounds one customer record. Book and assign from Attention — no CRM scavenger hunt.",
  },
  {
    id: "03",
    title: "Proof you can hand a partner.",
    body: "Weekly recovered jobs and dollars copy as a stamped artifact. No vanity dashboards. No invented ARR.",
  },
] as const;

/** Shop-floor doctrine — not founder “first principles” theater. */
export function HomeStatement() {
  return (
    <MktSection
      tone="dark"
      className="mkt-manifesto mkt-manifesto--laws"
      aria-labelledby="home-manifesto-heading"
    >
      <div className="mkt-manifesto-inner mkt-manifesto-inner--laws">
        <p className="mkt-manifesto-kicker font-sans">Night rules</p>
        <h2 id="home-manifesto-heading" className="mkt-manifesto-title">
          How the shop runs when you&apos;re not on the floor.
        </h2>
        <ol className="mkt-laws font-sans">
          {nightRules.map((rule) => (
            <li key={rule.id} className="mkt-law">
              <span className="mkt-law-id" aria-hidden>
                {rule.id}
              </span>
              <div className="mkt-law-copy">
                <h3 className="mkt-law-title">{rule.title}</h3>
                <p className="mkt-law-body">{rule.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </MktSection>
  );
}
