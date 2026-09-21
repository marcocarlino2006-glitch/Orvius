import { MarketingShell } from "@/components/marketing-shell";
import { MktSection } from "@/components/mkt-section";
import { company } from "@/lib/company";
import { demoLineHref, DEMO_LINE_DISPLAY } from "@/lib/demo-line";
import { workspaceAccessPublicClaim } from "@/lib/seats";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: `${company.productName} — ${company.categoryClaim} ${company.proofLine}`,
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="mkt-inner-hero" aria-labelledby="about-heading">
        <div className="mkt-inner-hero-copy">
          <p className="mkt-inner-brand">{company.productName}</p>
          <h1 id="about-heading" className="mkt-inner-title">
            {company.tagline}
          </h1>
          <p className="mkt-inner-lead font-sans">{company.proofLine}</p>
        </div>
      </section>

      <MktSection tone="light" aria-labelledby="about-loop-heading">
        <div className="mkt-inner-block">
          <h2 id="about-loop-heading" className="mkt-inner-section-title">
            Missed and after-hours calls become qualified jobs — proposed, then
            confirmed.
          </h2>
          <p className="mkt-inner-body font-sans">
            Orvius answers when your crew cannot — after hours and overflow —
            captures the request, proposes an open service window, texts the
            customer to confirm, and alerts you. One shop record for the call,
            the lead, and the job.
          </p>
          <ol className="mkt-laws mkt-laws--ruled font-sans">
            <li className="mkt-law mkt-law--ruled">
              <span className="mkt-law-index" aria-hidden>
                01
              </span>
              <div className="mkt-law-copy">
                <h3 className="mkt-law-title">Answer</h3>
                <p className="mkt-law-body">
                  After-hours and overflow on your Orvius line.
                </p>
              </div>
            </li>
            <li className="mkt-law mkt-law--ruled">
              <span className="mkt-law-index" aria-hidden>
                02
              </span>
              <div className="mkt-law-copy">
                <h3 className="mkt-law-title">Capture</h3>
                <p className="mkt-law-body">
                  Name, phone, service, urgency, and address.
                </p>
              </div>
            </li>
            <li className="mkt-law mkt-law--ruled">
              <span className="mkt-law-index" aria-hidden>
                03
              </span>
              <div className="mkt-law-copy">
                <h3 className="mkt-law-title">Propose + alert</h3>
                <p className="mkt-law-body">
                  Window by text for confirmation. Owner gets the request.
                </p>
              </div>
            </li>
          </ol>
        </div>
      </MktSection>

      <MktSection
        tone="inset"
        aria-labelledby="about-close-heading"
        className="mkt-proof-section--quiet"
      >
        <div className="mkt-close-block">
          <p className="mkt-proof-kicker font-sans">{company.legalName}</p>
          <h2 id="about-close-heading" className="mkt-proof-title">
            For {company.trades.join(", ")}.
          </h2>
          <p className="mkt-proof-lead font-sans">
            We claim only what the line closes today — capture, qualify, alert,
            book. {workspaceAccessPublicClaim()}
          </p>
          <div className="mkt-close-actions">
            <a href={demoLineHref()} className="ov-btn ov-btn--solid">
              Call {DEMO_LINE_DISPLAY}
            </a>
            <Link href="/pricing" className="ov-btn ov-btn--quiet">
              View pricing
            </Link>
          </div>
        </div>
      </MktSection>
    </MarketingShell>
  );
}
