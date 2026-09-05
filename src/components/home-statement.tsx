import { MktSection } from "@/components/mkt-section";
import { company } from "@/lib/company";

/**
 * Manifesto — why Orvius exists.
 * SpaceX energy: first principles, not feature bullets.
 */
export function HomeStatement() {
  return (
    <MktSection tone="dark" className="mkt-manifesto" aria-labelledby="home-manifesto-heading">
      <div className="mkt-manifesto-inner">
        <p className="mkt-manifesto-kicker font-sans">First law</p>
        <h2 id="home-manifesto-heading" className="mkt-manifesto-title">
          No demand dies after hours.
        </h2>
        <p className="mkt-manifesto-body font-sans">
          Every missed ring is wasted revenue and a customer who booked someone
          else. Orvius exists to end that — then become the OS that runs the
          shop: customers, jobs, dispatch, money, intelligence. One system.
          Humans keep the overrides.
        </p>
        <p className="mkt-manifesto-proof font-sans">{company.proofLine}</p>
      </div>
    </MktSection>
  );
}
