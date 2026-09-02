import Link from "next/link";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { summitCaseStudy } from "@/lib/trust";
import { MktSection, MktSectionHeader } from "@/components/mkt-section";

export function HomeProof() {
  return (
    <MktSection aria-labelledby="home-proof-heading">
      <MktSectionHeader
        kicker="Proof"
        title="Experience it. Then measure your own line."
        lead="No invented case studies. Call the live line now, or book an audit on your real after-hours traffic."
        titleId="home-proof-heading"
      />

      <div className="mkt-proof-grid font-sans">
        <article className="mkt-proof-card">
          <p className="mkt-proof-label">Live now</p>
          <h3 className="mkt-proof-title">Call {DEMO_LINE_DISPLAY}</h3>
          <p className="mkt-proof-body">
            Hear the AI answer and qualify. This is the product — not a video.
          </p>
          <a href={demoLineHref()} className="mkt-text-link">
            Try the live line →
          </a>
        </article>

        <article className="mkt-proof-card">
          <p className="mkt-proof-label">Reference shop</p>
          <h3 className="mkt-proof-title">
            {summitCaseStudy.name} · {summitCaseStudy.trade}
          </h3>
          <p className="mkt-proof-body">{summitCaseStudy.summary}</p>
          <p className="mkt-proof-note">{summitCaseStudy.attribution}</p>
        </article>

        <article className="mkt-proof-card">
          <p className="mkt-proof-label">Your audit</p>
          <h3 className="mkt-proof-title">Calls answered. Jobs booked. Gaps found.</h3>
          <p className="mkt-proof-body">
            We walk your pattern and leave you with a clear go / no-go — not a sales deck.
          </p>
          <Link href="/pilot" className="mkt-text-link">
            Book a live call audit →
          </Link>
        </article>
      </div>
    </MktSection>
  );
}
