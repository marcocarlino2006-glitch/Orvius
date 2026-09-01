import Link from "next/link";
import {
  DEMO_LINE_DISPLAY,
  DEMO_LINE_BUSINESS,
  demoLineHref,
} from "@/lib/demo-line";
import { company, getLowestPaidPrice } from "@/lib/company";

export function HomeLineHero() {
  return (
    <section className="tier1-hero inst-hero" aria-labelledby="tier1-hero-heading">
      <div className="editorial-wrap tier1-hero-inner">
        <p className="tier1-eyebrow font-brand">
          Live production line · {DEMO_LINE_BUSINESS}
        </p>

        <h1 id="tier1-hero-heading" className="tier1-hero-heading font-brand">
          Call the live line.
        </h1>
        <a href={demoLineHref()} className="tier1-hero-line font-brand">
          {DEMO_LINE_DISPLAY}
        </a>

        <p className="tier1-hero-statement font-sans">
          {company.tagline}
        </p>
        <p className="tier1-hero-lead font-sans">
          Orvius answers, qualifies, and alerts the owner — while your crew is
          on the tools. Built for {company.trades.join(", ")}.
        </p>

        <div className="tier1-actions inst-hero-actions font-sans">
          <a href={demoLineHref()} className="inst-btn inst-btn-primary">
            Call live line
          </a>
          <Link href="/login" className="inst-btn inst-btn-ghost">
            Get started
          </Link>
        </div>

        <p className="tier1-hero-foot font-sans">
          From ${getLowestPaidPrice()}/mo · billed by {company.legalName}
        </p>
      </div>
    </section>
  );
}
