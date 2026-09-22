import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import { demoLineHref } from "@/lib/demo-line";
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
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="About"
            title={company.tagline}
            subline={company.proofLine}
            description={company.mission}
            actions={
              <>
                <a href={demoLineHref()} className="ov-btn ov-btn--solid">
                  Call the live line
                </a>
                <Link href="/pilot" className="ov-btn ov-btn--quiet">
                  Request a demo
                </Link>
              </>
            }
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap max-w-3xl">
          <h2 className="tier1-section-title type-headline">
            Beginning: one HVAC shop, overflow and after-hours.
          </h2>
          <p className="tier1-section-lead font-sans">
            Orvius answers inbound calls, understands the problem, captures
            address and contact, identifies urgency, checks the service area,
            books, confirms, notifies the shop, and escalates when unsure. The
            goal is a controlled pilot that turns missed calls into completed,
            paid jobs — not the full OS on day one.
          </p>
          <ul className="tier1-strategy-list font-sans">
            <li>Answer · qualify · book · confirm · alert · escalate</li>
            <li>Deploy first on overflow or after-hours for one local HVAC company</li>
            <li>Charge a pilot and measure demand → completed work → money</li>
            <li>Expand recovery, estimates, dispatch, and payments only after the wedge pays</li>
          </ul>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap max-w-3xl">
          <h2 className="tier1-section-title type-headline">
            For HVAC first. Then the trades.
          </h2>
          <p className="tier1-section-lead font-sans">
            Built by {company.legalName}. We use replaceable AI models and own
            the workflow, data, and actions around them.{" "}
            {workspaceAccessPublicClaim()}
          </p>
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap tier1-story-grid">
          <div>
            <h2 className="tier1-section-title type-headline">{company.legalName}</h2>
            <p className="tier1-section-lead font-sans">
              Contracts and subscriptions are with {company.legalName}.{" "}
              {company.productName} is the product brand.
            </p>
          </div>
          <div className="tier1-actions">
            <a href={demoLineHref()} className="ov-btn ov-btn--solid">
              Call the live line
            </a>
            <Link href="/pilot" className="ov-btn ov-btn--quiet">
              Request a demo
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
