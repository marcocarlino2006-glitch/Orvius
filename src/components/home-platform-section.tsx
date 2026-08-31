import Link from "next/link";
import { platformPillars } from "@/lib/company";
import { demoLineHref } from "@/lib/demo-line";
import { summitCaseStudy } from "@/lib/trust";
import { RevealOnScroll } from "@/components/reveal-on-scroll";

export function HomePlatformSection() {
  return (
    <section className="cursor-platform" aria-label="Platform">
      <div className="editorial-wrap">
        <RevealOnScroll>
          <div className="cursor-platform-head">
            <p className="cursor-label font-sans">In production</p>
            <h2 className="cursor-section-title font-serif">
              {summitCaseStudy.name} runs on Orvius.
            </h2>
            <p className="cursor-body font-sans">{summitCaseStudy.summary}</p>
          </div>
        </RevealOnScroll>

        <RevealOnScroll delay={80}>
          <div className="cursor-platform-stats">
            {summitCaseStudy.outcomes.map((outcome) => (
              <div key={outcome.label} className="cursor-stat">
                <p className="cursor-stat-value font-sans">{outcome.value}</p>
                <p className="cursor-stat-label font-sans">{outcome.label}</p>
                <p className="cursor-stat-detail font-sans">{outcome.detail}</p>
              </div>
            ))}
          </div>
        </RevealOnScroll>

        <RevealOnScroll delay={120}>
          <div className="cursor-platform-grid">
            {platformPillars.map((pillar) => (
              <div key={pillar.title} className="cursor-feature">
                <h3 className="cursor-feature-title font-sans">{pillar.title}</h3>
                <p className="cursor-feature-body font-sans">{pillar.body}</p>
              </div>
            ))}
          </div>
        </RevealOnScroll>

        <RevealOnScroll delay={160}>
          <div className="cursor-platform-actions font-sans">
            <a href={demoLineHref()} className="cursor-link cursor-platform-link-call">
              Call live demo →
            </a>
            <Link href="/demo" className="cursor-link cursor-platform-link">
              Simulate in browser →
            </Link>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
