import Link from "next/link";
import { OwnerAlertCard } from "@/components/owner-alert-card";
import {
  DEMO_LINE_DISPLAY,
  demoLineHref,
} from "@/lib/demo-line";
import { company, getLowestPaidPrice } from "@/lib/company";

export function HomeLineHero() {
  return (
    <section className="tier1-hero inst-hero" aria-labelledby="tier1-hero-heading">
      <div className="editorial-wrap tier1-hero-inner inst-hero-grid">
        <div className="inst-hero-copy">
          <p className="tier1-eyebrow type-eyebrow">
            Live demo · {company.trades.join(" · ")}
          </p>

          <h1 id="tier1-hero-heading" className="tier1-hero-heading type-display">
            {company.productName}
          </h1>

          <p className="tier1-hero-statement font-sans">
            {company.tagline}
          </p>
          <p className="tier1-hero-lead type-lead">
            Call the live line. Hear the AI answer. Watch the owner alert land.
          </p>

          <a href={demoLineHref()} className="tier1-hero-line type-phone">
            {DEMO_LINE_DISPLAY}
          </a>

          <div className="tier1-actions inst-hero-actions font-sans">
            <a href={demoLineHref()} className="inst-btn inst-btn-primary">
              Call live demo
            </a>
            <Link href="/login" className="inst-btn inst-btn-ghost">
              Start free
            </Link>
          </div>

          <p className="tier1-hero-foot font-sans">
            From ${getLowestPaidPrice("year")}/mo annual · {company.trades.join(" · ")}
          </p>
        </div>

        <div className="inst-hero-proof">
          <p className="inst-hero-proof-label type-eyebrow">Owner alert</p>
          <OwnerAlertCard variant="chalk" className="inst-hero-alert" />
        </div>
      </div>
    </section>
  );
}
