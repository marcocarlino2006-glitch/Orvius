import Link from "next/link";
import { summitCaseStudy } from "@/lib/trust";

export function CaseStudySection() {
  return (
    <section className="premium-case" aria-labelledby="case-study-heading">
      <div className="editorial-wrap premium-case-grid">
        <div className="premium-case-copy">
          <p className="premium-kicker font-sans">In production</p>
          <h2 id="case-study-heading" className="premium-section-title font-serif">
            {summitCaseStudy.name} runs on Orvius.
          </h2>
          <p className="premium-body font-sans">{summitCaseStudy.summary}</p>
          <p className="premium-case-meta font-sans">
            {summitCaseStudy.trade} · {summitCaseStudy.location} · {summitCaseStudy.crew}
          </p>
          <blockquote className="premium-quote font-serif">
            &ldquo;{summitCaseStudy.quote}&rdquo;
          </blockquote>
          <p className="premium-quote-by font-sans">{summitCaseStudy.attribution}</p>
        </div>

        <div className="premium-case-stats">
          {summitCaseStudy.outcomes.map((outcome) => (
            <div key={outcome.label} className="premium-stat">
              <p className="premium-stat-value font-serif">{outcome.value}</p>
              <p className="premium-stat-label font-sans">{outcome.label}</p>
              <p className="premium-stat-detail font-sans">{outcome.detail}</p>
            </div>
          ))}
          <Link href="/demo" className="editorial-cta premium-case-cta font-sans">
            Watch demo
          </Link>
        </div>
      </div>
    </section>
  );
}
