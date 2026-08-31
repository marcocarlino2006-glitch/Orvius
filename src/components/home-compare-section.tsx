import Link from "next/link";
import { pricingComparison } from "@/lib/trust";
import { pricing } from "@/lib/company";

export function HomeCompareSection() {
  return (
    <section className="home-compare" aria-labelledby="compare-heading">
      <div className="editorial-wrap">
        <div className="home-compare-head">
          <p className="home-platform-kicker font-sans">Why Orvius</p>
          <h2 id="compare-heading" className="home-platform-title font-sans">
            One flat price. One operating system.
          </h2>
          <p className="home-platform-lead font-sans">
            Voicemail loses jobs. Bolt-on AI leaves your CRM empty. Orvius is
            ${pricing.pro.price}/mo — call to lead to job, in one place.
          </p>
        </div>

        <div className="home-compare-table" role="table" aria-label="Pricing comparison">
          <div className="home-compare-row home-compare-row-head" role="row">
            <span role="columnheader">Option</span>
            <span role="columnheader">Cost</span>
            <span role="columnheader">What you get</span>
          </div>
          {pricingComparison.map((row) => (
            <div
              key={row.label}
              role="row"
              className={`home-compare-row ${
                row.highlight ? "home-compare-row-highlight" : ""
              }`}
            >
              <span className="home-compare-label font-sans" role="cell">
                {row.label}
              </span>
              <span className="home-compare-cost font-sans" role="cell">
                {row.cost}
              </span>
              <span className="home-compare-pain font-sans" role="cell">
                {row.pain}
              </span>
            </div>
          ))}
        </div>

        <Link href="/pilot" className="btn btn-void text-sm home-compare-cta">
          Get Orvius on your line
        </Link>
      </div>
    </section>
  );
}
