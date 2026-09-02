import Link from "next/link";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { summitCaseStudy } from "@/lib/trust";

/**
 * Proof without vapor — live demo you can verify, labeled reference shop,
 * and a path to measure your own line. No invented revenue figures.
 */
export function HomeProof() {
  return (
    <section className="home-proof" aria-labelledby="home-proof-heading">
      <div className="editorial-wrap">
        <p className="tier1-eyebrow type-eyebrow">Proof</p>
        <h2 id="home-proof-heading" className="tier1-section-title type-headline">
          Experience it. Then measure your own line.
        </h2>
        <p className="tier1-section-lead font-sans">
          We will not invent customer logos or recovered-revenue charts. You can
          call the live line now. Design partners get a call audit on their real
          after-hours traffic.
        </p>

        <div className="home-proof-grid font-sans">
          <article className="home-proof-block">
            <p className="home-proof-kicker">Live now</p>
            <h3 className="home-proof-title">Call {DEMO_LINE_DISPLAY}</h3>
            <p className="home-proof-body">
              Hear the AI answer, qualify, and see how an owner alert is built.
              This is the product — not a video.
            </p>
            <a href={demoLineHref()} className="home-proof-link">
              Try the live line →
            </a>
          </article>

          <article className="home-proof-block">
            <p className="home-proof-kicker">Reference shop</p>
            <h3 className="home-proof-title">
              {summitCaseStudy.name} · {summitCaseStudy.trade}
            </h3>
            <p className="home-proof-body">{summitCaseStudy.summary}</p>
            <p className="home-proof-note">{summitCaseStudy.attribution}</p>
          </article>

          <article className="home-proof-block">
            <p className="home-proof-kicker">Your audit</p>
            <h3 className="home-proof-title">Calls answered. Jobs booked. Gaps found.</h3>
            <p className="home-proof-body">
              We walk your after-hours and overflow pattern, show what Orvius would
              capture, and leave you with a clear go / no-go — not a sales deck.
            </p>
            <Link href="/pilot" className="home-proof-link">
              Book a live call audit →
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
