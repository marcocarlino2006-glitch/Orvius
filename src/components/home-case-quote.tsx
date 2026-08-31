import Link from "next/link";
import { summitCaseStudy } from "@/lib/trust";

export function HomeCaseQuote() {
  return (
    <section className="tier1-quote" aria-labelledby="case-quote-heading">
      <div className="tier1-quote-glow" aria-hidden />
      <div className="editorial-wrap tier1-quote-inner">
        <blockquote className="tier1-quote-block">
          <p id="case-quote-heading" className="tier1-quote-text font-sans">
            &ldquo;{summitCaseStudy.quote}&rdquo;
          </p>
          <footer className="tier1-quote-meta font-sans">
            <cite>{summitCaseStudy.attribution}</cite>
            <span>
              {summitCaseStudy.location} · {summitCaseStudy.crew}
            </span>
          </footer>
        </blockquote>
        <Link href="/pilot" className="inst-btn inst-btn-outline-light tier1-quote-cta">
          Design partner program
        </Link>
      </div>
    </section>
  );
}
