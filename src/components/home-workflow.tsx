import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const stages = [
  {
    step: "01",
    name: "Call",
    body: "Nights, weekends, overflow — urgency, address, callback captured.",
  },
  {
    step: "02",
    name: "Jobs",
    body: "Qualified leads become booked appointments.",
  },
  {
    step: "03",
    name: "Dispatch",
    body: "Assign techs. Run the day from one board.",
  },
  {
    step: "04",
    name: "Ask",
    body: "Who called, what's unassigned, how the week booked.",
  },
] as const;

export function HomeWorkflow() {
  return (
    <MktSection id="workflow" tone="dark" aria-labelledby="home-workflow-heading">
      <MktSectionHeader
        light
        kicker="How it works"
        title="Ring → job → paid."
        titleId="home-workflow-heading"
      />

      <ol className="mkt-steps font-sans">
        {stages.map((stage) => (
          <li key={stage.name} className="mkt-step">
            <span className="mkt-step-num">{stage.step}</span>
            <h3 className="mkt-step-name">{stage.name}</h3>
            <p className="mkt-step-body">{stage.body}</p>
          </li>
        ))}
      </ol>
    </MktSection>
  );
}
