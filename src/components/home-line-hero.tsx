import Link from "next/link";
import { OwnerAlertCard } from "@/components/owner-alert-card";
import {
  DEMO_LINE_DISPLAY,
  DEMO_LINE_BUSINESS,
  demoLineHref,
} from "@/lib/demo-line";
import { company, getLowestPaidPrice } from "@/lib/company";

export function HomeLineHero() {
  return (
    <section className="tier1-hero inst-hero" aria-labelledby="tier1-hero-heading">
      <div className="editorial-wrap tier1-hero-inner inst-hero-grid">
        <div className="inst-hero-copy">
          <p className="tier1-eyebrow type-eyebrow">
            Live production line · {DEMO_LINE_BUSINESS}
          </p>

          <h1 id="tier1-hero-heading" className="tier1-hero-heading type-display">
            Call the live line.
          </h1>
          <a href={demoLineHref()} className="tier1-hero-line type-phone">
            {DEMO_LINE_DISPLAY}
          </a>

          <p className="tier1-hero-statement font-sans">
            {company.tagline}
          </p>
          <p className="tier1-hero-lead type-lead">
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

        <div className="inst-hero-proof">
          <p className="inst-hero-proof-label type-eyebrow">What the owner sees</p>
          <OwnerAlertCard variant="chalk" className="inst-hero-alert" />
        </div>
      </div>
    </section>
  );
}
