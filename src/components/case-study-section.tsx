import Link from "next/link";
import { summitCaseStudy } from "@/lib/trust";

export function CaseStudySection() {
  return (
    <section className="cursor-section" aria-labelledby="case-study-heading">
      <div className="editorial-wrap cursor-split">
        <div className="cursor-split-copy tier-reveal">
          <p className="cursor-label font-sans">In production</p>
          <h2 id="case-study-heading" className="cursor-section-title font-serif">
            {summitCaseStudy.name} runs on Orvius.
          </h2>
          <p className="cursor-body font-sans">{summitCaseStudy.summary}</p>
          <Link href="/demo" className="cursor-link font-sans">
            Watch demo →
          </Link>
        </div>

        <div className="cursor-stats tier-reveal tier-reveal-delay">
          {summitCaseStudy.outcomes.map((outcome) => (
            <div key={outcome.label} className="cursor-stat">
              <p className="cursor-stat-value font-sans">{outcome.value}</p>
              <p className="cursor-stat-label font-sans">{outcome.label}</p>
              <p className="cursor-stat-detail font-sans">{outcome.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
