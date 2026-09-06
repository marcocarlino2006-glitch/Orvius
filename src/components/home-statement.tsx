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

/** Doctrine with institutional mass — dense, editorial, not three lonely bullets. */
export function HomeStatement() {
  return (
    <MktSection
      tone="dark"
      className="mkt-manifesto mkt-manifesto--meta"
      aria-labelledby="home-manifesto-heading"
    >
      <div className="mkt-manifesto-meta">
        <div className="mkt-manifesto-meta-lead">
          <p className="mkt-manifesto-kicker font-sans">Night rules</p>
          <h2 id="home-manifesto-heading" className="mkt-manifesto-title">
            How the shop runs when you&apos;re not on the floor.
          </h2>
          <p className="mkt-manifesto-aside font-sans">
            Orvius is the night-shift OS — not an AI receptionist bolted onto a
            CRM. The board holds every call, job, and dollar in one record.
          </p>
        </div>
        <ol className="mkt-laws mkt-laws--meta font-sans">
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
