import Link from "next/link";
import { pricingComparison } from "@/lib/trust";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { pricing } from "@/lib/company";

export function HomeCompareSection() {
  return (
    <section className="home-compare" aria-labelledby="compare-heading">
      <div className="editorial-wrap">
        <RevealOnScroll>
          <div className="home-compare-head">
            <p className="cursor-label font-sans">Why Orvius</p>
            <h2 id="compare-heading" className="cursor-section-title font-serif">
              Voicemail loses jobs. Bolt-ons leave your CRM empty.
            </h2>
            <p className="cursor-body font-sans">
              Orvius is the only option that turns every call into a qualified
              lead inside your operating system — for ${pricing.pro.price}/mo
              flat.
            </p>
          </div>
        </RevealOnScroll>

        <RevealOnScroll delay={80}>
          <div className="home-compare-grid" aria-label="Pricing comparison">
            {pricingComparison.map((row) => (
              <div
                key={row.label}
                className={`home-compare-row ${
                  row.highlight ? "home-compare-row-highlight" : ""
                }`}
              >
                <p className="home-compare-label font-sans">{row.label}</p>
                <p className="home-compare-cost font-serif">{row.cost}</p>
                <p className="home-compare-pain font-sans">{row.pain}</p>
              </div>
            ))}
          </div>
        </RevealOnScroll>

        <RevealOnScroll delay={120}>
          <Link href="/pilot" className="cursor-link font-sans home-compare-cta">
            Get Orvius on your line →
          </Link>
        </RevealOnScroll>
      </div>
    </section>
  );
}
