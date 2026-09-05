import { MktSection } from "@/components/mkt-section";

const laws = [
  {
    id: "I",
    title: "No demand dies after hours.",
    body: "Every missed ring is wasted revenue and a customer who booked someone else. The line answers. Always.",
  },
  {
    id: "II",
    title: "Qualified calls become jobs.",
    body: "Not sticky notes. Not voicemail. A booked appointment on the shop record — address, urgency, owner alert.",
  },
  {
    id: "III",
    title: "One command plane. Human overrides.",
    body: "Dispatch, money, and intelligence run from one OS. High-risk moves stay approve-first. You stay in command.",
  },
] as const;

/**
 * Three Laws — first principles, not marketing sections.
 */
export function HomeStatement() {
  return (
    <MktSection tone="dark" className="mkt-manifesto mkt-manifesto--laws" aria-labelledby="home-manifesto-heading">
      <div className="mkt-manifesto-inner mkt-manifesto-inner--laws">
        <p className="mkt-manifesto-kicker font-sans">Laws of Orvius</p>
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
