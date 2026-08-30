import { platformPillars } from "@/lib/company";

export function TierProofStrip() {
  return (
    <section className="tier-proof" aria-label="Orvius capabilities">
      <div className="editorial-wrap tier-proof-inner">
        {platformPillars.map((pillar, index) => (
          <div key={pillar.title} className="tier-proof-item">
            {index > 0 ? <span className="tier-proof-divider" aria-hidden /> : null}
            <p className="tier-proof-title font-sans">{pillar.title}</p>
            <p className="tier-proof-body font-sans">{pillar.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
