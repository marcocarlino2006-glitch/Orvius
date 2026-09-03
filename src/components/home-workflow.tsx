import { MktSection, MktSectionHeader } from "@/components/mkt-section";

const stages = [
  {
    name: "Call",
    artifact: "Live line",
    body: "Answer nights, weekends, and overflow. Capture urgency, address, and callback.",
    ui: {
      label: "Inbound",
      lines: ["Emergency AC", "1842 Oak · today", "Owner SMS queued"],
    },
  },
  {
    name: "Jobs",
    artifact: "Booked job",
    body: "Qualified leads become booked appointments — not sticky notes.",
    ui: {
      label: "Job #4821",
      lines: ["Booked · today 2–4p", "Maria Lopez", "Transcript attached"],
    },
  },
  {
    name: "Dispatch",
    artifact: "Board",
    body: "Assign techs, advance status, run the day from one board.",
    ui: {
      label: "Assign",
      lines: ["Jake M. · truck 2", "ETA 45 min", "SMS confirmed"],
    },
  },
  {
    name: "Ask",
    artifact: "Shop chat",
    body: "Type a plain question — “who called after hours?” — and get an answer from your shop record.",
    ui: {
      label: "Ask Orvius",
      lines: ["3 after-hours calls", "2 still unassigned", "1 emergency open"],
    },
  },
] as const;

export function HomeWorkflow() {
  return (
    <MktSection id="workflow" tone="light" aria-labelledby="home-workflow-heading" className="mkt-mastery-section">
      <MktSectionHeader
        kicker="How it works"
        title="From the ring to paid work — one path."
        lead="Every stage leaves a real artifact in the OS. Call, job, board, Ask — one record the shop can run."
        titleId="home-workflow-heading"
      />

      <ol className="mkt-flow mkt-flow--mastery font-sans">
        {stages.map((stage, index) => (
          <li key={stage.name} className="mkt-flow-step mkt-flow-step--mastery">
            {index > 0 ? <span className="mkt-flow-connector" aria-hidden /> : null}
            <div className="mkt-flow-step-top">
              <span className="mkt-flow-index">{String(index + 1).padStart(2, "0")}</span>
              <p className="mkt-flow-artifact">{stage.artifact}</p>
            </div>
            <h3 className="mkt-flow-name">{stage.name}</h3>
            <p className="mkt-flow-body">{stage.body}</p>
            <div className="mkt-flow-ui" aria-hidden>
              <p className="mkt-flow-ui-label">{stage.ui.label}</p>
              <ul>
                {stage.ui.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </MktSection>
  );
}
