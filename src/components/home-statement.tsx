import { MktSection } from "@/components/mkt-section";

const nightRules = [
  {
    id: "01",
    key: "rule1",
    title: "The bay never goes dark.",
    body: "After-hours and overflow get answered, qualified, and alerted — demand does not die on voicemail.",
  },
  {
    id: "02",
    key: "rule2",
    title: "One board. Not twelve tabs.",
    body: "Every call, text, and job stays on one shop record — clear the board, move on.",
  },
  {
    id: "03",
    key: "rule3",
    title: "A clear weekly summary.",
    body: "See what the line proposed this week — jobs and estimated value you can check against your books.",
  },
] as const;

/** Night doctrine as a ruled list — one column, Stripe restraint, no cards. */
export function HomeStatement() {
  return (
    <MktSection
      tone="light"
      className="mkt-manifesto mkt-manifesto--rules"
      aria-labelledby="home-manifesto-heading"
    >
      <div className="mkt-manifesto-rules">
        <header className="mkt-manifesto-rules-head">
          <p className="mkt-manifesto-kicker font-sans" data-i18n="rules.kicker">
            Night rules
          </p>
          <h2
            id="home-manifesto-heading"
            className="mkt-manifesto-title mkt-manifesto-title--display"
            data-i18n="rules.title"
          >
            How the shop runs when you&apos;re not on the floor.
          </h2>
        </header>

        <ol className="mkt-laws mkt-laws--ruled font-sans">
          {nightRules.map((rule) => (
            <li key={rule.id} className="mkt-law mkt-law--ruled">
              <span className="mkt-law-index" aria-hidden>
                {rule.id}
              </span>
              <div className="mkt-law-copy">
                <h3 className="mkt-law-title" data-i18n={`${rule.key}.title`}>
                  {rule.title}
                </h3>
                <p className="mkt-law-body" data-i18n={`${rule.key}.body`}>
                  {rule.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </MktSection>
  );
}
