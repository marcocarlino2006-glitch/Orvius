import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const spine =
  "Every call becomes a qualified customer, every customer becomes a scheduled job, and every job stays organized until it gets paid.";

const stages = [
  {
    step: "01",
    name: "Call",
    body: "Answer nights, weekends, and overflow. Capture urgency, address, and callback.",
  },
  {
    step: "02",
    name: "Jobs",
    body: "Qualified leads become booked appointments — not sticky notes.",
  },
  {
    step: "03",
    name: "Dispatch",
    body: "Assign techs, advance status, run the day from one board.",
  },
  {
    step: "04",
    name: "Ask",
    body: "Shop memory — who called, what's unassigned, how the week booked.",
  },
] as const;

export function HomeWorkflow() {
  return (
    <MktSection id="workflow" tone="dark" aria-labelledby="home-workflow-heading">
      <MktSectionHeader
        light
        kicker="The job"
        title="From the ring to paid work — one path."
        lead={spine}
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
