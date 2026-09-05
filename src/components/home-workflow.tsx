import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const stages = [
  {
    name: "Capture",
    artifact: "Live line",
    body: "Nights. Weekends. Overflow. Urgency, address, callback — locked.",
  },
  {
    name: "Convert",
    artifact: "Booked job",
    body: "Qualified demand becomes an appointment on the record. Instantly.",
  },
  {
    name: "Command",
    artifact: "Board",
    body: "Assign. Advance. Run the day from one attention plane.",
  },
  {
    name: "Compound",
    artifact: "Intelligence",
    body: "Ask the OS. Every call and job sharpens the next.",
  },
] as const;

export function HomeWorkflow() {
  return (
    <MktSection
      id="workflow"
      tone="light"
      aria-labelledby="home-workflow-heading"
      className="mkt-mastery-section"
    >
      <MktSectionHeader
        kicker="Architecture"
        title="The closed loop."
        lead="Four stages. One record. Revenue compounds; chaos does not."
        titleId="home-workflow-heading"
      />

      <ol className="mkt-flow mkt-flow--mastery mkt-flow--sparse mkt-flow--loop font-sans">
        {stages.map((stage, index) => (
          <li
            key={stage.name}
            className="mkt-flow-step mkt-flow-step--mastery mkt-flow-step--sparse"
          >
            {index > 0 ? <span className="mkt-flow-connector" aria-hidden /> : null}
            <span className="mkt-flow-index">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="mkt-flow-name">{stage.name}</h3>
            <p className="mkt-flow-artifact">{stage.artifact}</p>
            <p className="mkt-flow-body">{stage.body}</p>
          </li>
        ))}
      </ol>
    </MktSection>
  );
}
