import Link from "next/link";
import { summitCaseStudy } from "@/lib/trust";
import { RevealOnScroll } from "@/components/reveal-on-scroll";

export function HomeCaseQuote() {
  return (
    <section className="home-case-quote" aria-labelledby="case-quote-heading">
      <div className="editorial-wrap">
        <RevealOnScroll>
          <blockquote className="home-case-quote-block">
            <p
              id="case-quote-heading"
              className="home-case-quote-text font-serif"
            >
              &ldquo;{summitCaseStudy.quote}&rdquo;
            </p>
            <footer className="home-case-quote-meta font-sans">
              <cite>{summitCaseStudy.attribution}</cite>
              <span>
                {summitCaseStudy.location} · {summitCaseStudy.crew}
              </span>
            </footer>
          </blockquote>
          <Link href="/pilot" className="cursor-link font-sans">
            Apply for design partner →
          </Link>
        </RevealOnScroll>
      </div>
    </section>
  );
}
