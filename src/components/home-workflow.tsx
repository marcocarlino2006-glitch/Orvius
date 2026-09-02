import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const stages = [
  {
    name: "Call",
    body: "Answer nights, weekends, and overflow. Capture urgency, address, and callback.",
  },
  {
    name: "Jobs",
    body: "Qualified leads become booked appointments — not sticky notes.",
  },
  {
    name: "Dispatch",
    body: "Assign techs, advance status, run the day from one board.",
  },
  {
    name: "Ask",
    body: "Shop memory — who called, what's unassigned, how the week booked.",
  },
] as const;

export function HomeWorkflow() {
  return (
    <MktSection id="workflow" tone="light" aria-labelledby="home-workflow-heading">
      <MktSectionHeader
        kicker="How it works"
        title="From the ring to paid work — one path."
        lead="Every call becomes a qualified customer. Every customer becomes a scheduled job. Every job stays organized until it gets paid."
        titleId="home-workflow-heading"
      />

      <ol className="mkt-pillars font-sans">
        {stages.map((stage, index) => (
          <li key={stage.name} className="mkt-pillar">
            <span className="mkt-pillar-index">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="mkt-pillar-name">{stage.name}</h3>
            <p className="mkt-pillar-body">{stage.body}</p>
          </li>
        ))}
      </ol>
    </MktSection>
  );
}
