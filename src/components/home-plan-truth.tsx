import Link from "next/link";

/** Honest plan truth — Line captures; Pro runs the shop. */
export function HomePlanTruth() {
  return (
    <section className="home-plan-truth" aria-labelledby="home-plan-truth-heading">
      <div className="editorial-wrap">
        <p className="tier1-eyebrow type-eyebrow">Plans</p>
        <h2 id="home-plan-truth-heading" className="tier1-section-title type-headline">
          Line answers the phone. Pro runs the shop.
        </h2>
        <p className="tier1-section-lead font-sans">
          Start with call → lead → alert. Add jobs, dispatch, estimates, and Ask
          when you are ready — not before.
        </p>

        <div className="home-plan-truth-grid font-sans">
          <div className="home-plan-truth-col">
            <h3 className="home-plan-truth-name">Line</h3>
            <p className="home-plan-truth-body">
              Dedicated shop number, qualified leads, owner SMS, call log. The
              front door.
            </p>
          </div>
          <div className="home-plan-truth-col">
            <h3 className="home-plan-truth-name">Pro</h3>
            <p className="home-plan-truth-body">
              Customers, jobs, dispatch, estimates, and Ask — the contractor
              command center on top of Line.
            </p>
          </div>
        </div>

        <p className="home-plan-truth-link">
          <Link href="/pricing">Compare pricing →</Link>
        </p>
      </div>
    </section>
  );
}
