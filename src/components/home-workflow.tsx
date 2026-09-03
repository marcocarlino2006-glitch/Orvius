import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const stages = [
  {
    name: "Call",
    artifact: "Live line",
    body: "Answer nights, weekends, and overflow. Capture urgency, address, and callback.",
  },
  {
    name: "Jobs",
    artifact: "Booked job",
    body: "Qualified leads become booked appointments — not sticky notes.",
  },
  {
    name: "Dispatch",
    artifact: "Board",
    body: "Assign techs, advance status, run the day from one board.",
  },
  {
    name: "Ask",
    artifact: "Shop chat",
    body: "Type a plain question — “who called after hours?” or “what’s still unassigned?” — and get an answer from your shop record.",
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

      <ol className="mkt-flow font-sans">
        {stages.map((stage, index) => (
          <li key={stage.name} className="mkt-flow-step">
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
