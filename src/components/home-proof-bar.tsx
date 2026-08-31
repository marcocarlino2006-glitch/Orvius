import { trustSignals } from "@/lib/trust";

export function HomeProofBar() {
  return (
    <section className="home-proof-bar" aria-label="Proof points">
      <div className="editorial-wrap home-proof-bar-inner">
        {trustSignals.map((signal, index) => (
          <div key={signal.label} className="home-proof-bar-item">
            {index > 0 ? <span className="home-proof-bar-divider" aria-hidden /> : null}
            <p className="home-proof-bar-value font-sans">{signal.value}</p>
            <p className="home-proof-bar-label font-sans">{signal.label}</p>
            <p className="home-proof-bar-detail font-sans">{signal.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
