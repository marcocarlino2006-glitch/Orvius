import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const stages = [
  {
    name: "Capture",
    artifact: "Live line",
    body: "Nights, weekends, overflow — urgency, address, callback locked in.",
  },
  {
    name: "Convert",
    artifact: "Booked job",
    body: "Qualified demand becomes an appointment on the shop record.",
  },
  {
    name: "Command",
    artifact: "Dispatch board",
    body: "Assign techs and run the day from one attention plane.",
  },
  {
    name: "Compound",
    artifact: "Shop intelligence",
    body: "Ask the OS. Every call and job makes the next one sharper.",
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
        kicker="The machine"
        title="From ring to paid work — then the OS compounds."
        lead="Four laws of the autonomous shop. Each stage leaves an artifact. One record. One command plane."
        titleId="home-workflow-heading"
      />

      <ol className="mkt-flow mkt-flow--mastery mkt-flow--sparse font-sans">
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
