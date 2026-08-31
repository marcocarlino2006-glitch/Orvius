import Link from "next/link";
import {
  DEMO_LINE_DISPLAY,
  DEMO_LINE_BUSINESS,
  demoLineHref,
} from "@/lib/demo-line";
import { company, pricing } from "@/lib/company";

export function HomeLineHero() {
  return (
    <section className="shop-hero" aria-labelledby="shop-hero-heading">
      <div className="editorial-wrap shop-hero-inner">
        <p className="shop-hero-shop font-sans">
          Live on {DEMO_LINE_BUSINESS} · {company.trades.join(" · ")}
        </p>

        <h1 id="shop-hero-heading" className="sr-only">
          Call the Orvius live demo line
        </h1>
        <a href={demoLineHref()} className="shop-hero-line font-sans">
          {DEMO_LINE_DISPLAY}
        </a>

        <p className="shop-hero-lead font-sans">
          Call it now. Orvius answers like your shop — qualifies the job, texts
          the owner, writes the lead to the board.
        </p>

        <div className="shop-hero-actions font-sans">
          <a href={demoLineHref()} className="shop-hero-call">
            Call now
          </a>
          <Link href="/demo" className="shop-hero-secondary">
            Run a simulation
          </Link>
        </div>

        <p className="shop-hero-foot font-sans">
          ${pricing.pro.price}/mo flat · 30-day design partner · cancel anytime
        </p>
      </div>
    </section>
  );
}
