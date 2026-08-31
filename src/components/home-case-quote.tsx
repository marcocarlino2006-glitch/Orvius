import Link from "next/link";
import { summitCaseStudy } from "@/lib/trust";

export function HomeCaseQuote() {
  return (
    <section className="shop-quote" aria-labelledby="case-quote-heading">
      <div className="editorial-wrap">
        <blockquote className="shop-quote-block">
          <p id="case-quote-heading" className="shop-quote-text font-sans">
            &ldquo;{summitCaseStudy.quote}&rdquo;
          </p>
          <footer className="shop-quote-meta font-sans">
            <cite>{summitCaseStudy.attribution}</cite>
            <span>
              {summitCaseStudy.location} · {summitCaseStudy.crew}
            </span>
          </footer>
        </blockquote>
        <Link href="/pilot" className="shop-hero-secondary shop-quote-link">
          Apply for design partner →
        </Link>
      </div>
    </section>
  );
}
