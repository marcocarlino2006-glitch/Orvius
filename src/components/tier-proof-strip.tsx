import { platformPillars } from "@/lib/company";

export function TierProofStrip() {
  return (
    <section className="cursor-features" aria-label="Orvius capabilities">
      <div className="editorial-wrap cursor-features-grid">
        {platformPillars.map((pillar) => (
          <div key={pillar.title} className="cursor-feature">
            <h3 className="cursor-feature-title font-sans">{pillar.title}</h3>
            <p className="cursor-feature-body font-sans">{pillar.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
