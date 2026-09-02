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
          No vapor tiers. Pick the loop you need now.
        </p>

        <div className="home-plan-truth-grid font-sans">
          <div className="home-plan-truth-col">
            <h3 className="home-plan-truth-name">Line</h3>
            <p className="home-plan-truth-body">
              Call → qualified lead → owner alert. Dedicated shop number, inbox,
              transcripts.
            </p>
          </div>
          <div className="home-plan-truth-col">
            <h3 className="home-plan-truth-name">Pro</h3>
            <p className="home-plan-truth-body">
              Everything in Line, plus customers, jobs, dispatch, estimates, and Ask
              — the contractor command center.
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
