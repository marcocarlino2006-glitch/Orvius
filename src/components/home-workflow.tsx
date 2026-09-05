import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const stages = [
  {
    name: "Call",
    artifact: "Live line",
    body: "Nights, weekends, overflow — urgency, address, callback captured.",
  },
  {
    name: "Jobs",
    artifact: "Booked job",
    body: "Qualified leads become appointments on the shop record.",
  },
  {
    name: "Dispatch",
    artifact: "Board",
    body: "Assign techs and run the day from one board.",
  },
  {
    name: "Ask",
    artifact: "Shop memory",
    body: "Plain questions against your calls, jobs, and alerts.",
  },
] as const;

export function HomeWorkflow() {
  return (
    <MktSection id="workflow" tone="light" aria-labelledby="home-workflow-heading" className="mkt-mastery-section">
      <MktSectionHeader
        kicker="Product"
        title="Ring to paid work — one path."
        lead="Every stage leaves an artifact in the OS. One record the shop can run."
        titleId="home-workflow-heading"
      />

      <ol className="mkt-flow mkt-flow--mastery mkt-flow--sparse font-sans">
        {stages.map((stage, index) => (
          <li key={stage.name} className="mkt-flow-step mkt-flow-step--mastery mkt-flow-step--sparse">
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
