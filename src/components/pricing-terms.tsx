import { commercialTerms } from "@/lib/commercial-terms";

export function PricingTerms() {
  return (
    <section className="pricing-terms font-sans" aria-label="What you pay and what's included">
      {commercialTerms().map((group) => (
        <div key={group.id} id={group.id} className="pricing-terms-group">
          <h2 className="pricing-terms-title type-headline">{group.title}</h2>
          <p className="pricing-terms-lead">{group.lead}</p>
          <dl className="pricing-terms-rows">
            {group.rows.map((row) => (
              <div key={row.id} className="pricing-terms-row">
                <dt>{row.label}</dt>
                <dd>{row.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}
