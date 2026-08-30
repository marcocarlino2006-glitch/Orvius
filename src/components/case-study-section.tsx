import Link from "next/link";
import { summitCaseStudy } from "@/lib/trust";

export function CaseStudySection() {
  return (
    <section className="tier-case" aria-labelledby="case-study-heading">
      <div className="editorial-wrap tier-case-grid">
        <div className="tier-case-copy tier-reveal">
          <p className="tier-label font-sans">In production</p>
          <h2 id="case-study-heading" className="tier-case-title font-serif">
            {summitCaseStudy.name} runs on Orvius.
          </h2>
          <p className="tier-case-body font-sans">{summitCaseStudy.summary}</p>
          <blockquote className="tier-case-quote font-serif">
            &ldquo;{summitCaseStudy.quote}&rdquo;
          </blockquote>
          <p className="tier-case-meta font-sans">
            {summitCaseStudy.trade} · {summitCaseStudy.location} · {summitCaseStudy.crew}
          </p>
        </div>

        <div className="tier-case-stats tier-reveal tier-reveal-delay">
          {summitCaseStudy.outcomes.map((outcome) => (
            <div key={outcome.label} className="tier-case-stat">
              <p className="tier-case-stat-value font-serif">{outcome.value}</p>
              <p className="tier-case-stat-label font-sans">{outcome.label}</p>
              <p className="tier-case-stat-detail font-sans">{outcome.detail}</p>
            </div>
          ))}
          <Link href="/demo" className="tier-btn tier-btn-primary tier-case-cta font-sans">
            Watch demo
          </Link>
        </div>
      </div>
    </section>
  );
}
