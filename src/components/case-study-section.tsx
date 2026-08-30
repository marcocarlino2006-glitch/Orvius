import Link from "next/link";
import { summitCaseStudy } from "@/lib/trust";

export function CaseStudySection() {
  return (
    <section className="case-study" aria-labelledby="case-study-heading">
      <div className="editorial-wrap">
        <div className="case-study-grid">
          <div className="case-study-copy">
            <p className="home-kicker font-sans">Design partner</p>
            <h2 id="case-study-heading" className="editorial-heading font-serif">
              {summitCaseStudy.name} runs on Orvius.
            </h2>
            <p className="editorial-body font-sans">{summitCaseStudy.summary}</p>
            <p className="case-study-meta font-sans">
              {summitCaseStudy.trade} · {summitCaseStudy.location} ·{" "}
              {summitCaseStudy.crew} · Live since {summitCaseStudy.partnerSince}
            </p>
            <div className="editorial-actions font-sans">
              <Link href="/demo" className="editorial-cta">
                Hear a call
              </Link>
              <Link href="/pilot" className="editorial-link">
                Apply for pilot
              </Link>
            </div>
          </div>

          <div className="case-study-panel">
            <p className="home-os-kicker">Results</p>
            <ul className="case-study-outcomes">
              {summitCaseStudy.outcomes.map((outcome) => (
                <li key={outcome.label} className="case-study-outcome">
                  <span className="case-study-outcome-value font-serif">
                    {outcome.value}
                  </span>
                  <span className="case-study-outcome-label font-sans">
                    {outcome.label}
                  </span>
                  <span className="case-study-outcome-detail font-sans">
                    {outcome.detail}
                  </span>
                </li>
              ))}
            </ul>

            <blockquote className="case-study-quote">
              <p className="font-serif">&ldquo;{summitCaseStudy.quote}&rdquo;</p>
              <footer className="case-study-attribution font-sans">
                {summitCaseStudy.attribution}
              </footer>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}
