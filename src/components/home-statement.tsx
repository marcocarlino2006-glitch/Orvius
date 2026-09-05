import { MktSection } from "@/components/mkt-section";

const laws = [
  {
    id: "I",
    title: "No demand dies after hours.",
    body: "The line answers, qualifies, and alerts. Capture closes.",
  },
  {
    id: "II",
    title: "Every touch compounds the record.",
    body: "Calls, texts, and jobs land on one customer brain — then book.",
  },
  {
    id: "III",
    title: "One command plane. Proof that prints.",
    body: "Act from Attention. Approve high-risk moves. Copy weekly recovered $.",
  },
] as const;

/** First principles — absolute enough to feel like law. */
export function HomeStatement() {
  return (
    <MktSection
      tone="dark"
      className="mkt-manifesto mkt-manifesto--laws"
      aria-labelledby="home-manifesto-heading"
    >
      <div className="mkt-manifesto-inner mkt-manifesto-inner--laws">
        <p className="mkt-manifesto-kicker font-sans">Laws</p>
        <h2 id="home-manifesto-heading" className="mkt-manifesto-title">
          Built from first principles.
        </h2>
        <ol className="mkt-laws font-sans">
          {laws.map((law) => (
            <li key={law.id} className="mkt-law">
              <span className="mkt-law-id" aria-hidden>
                {law.id}
              </span>
              <div className="mkt-law-copy">
                <h3 className="mkt-law-title">{law.title}</h3>
                <p className="mkt-law-body">{law.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </MktSection>
  );
}
