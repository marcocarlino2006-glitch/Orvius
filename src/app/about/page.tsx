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
            description="Most trade shops don't lose work to a better competitor. They lose it to voicemail. Orvius answers the calls a shop can't take, understands them, books them, and hands the owner a short list in the morning."
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
            Why heating and cooling first.
          </h2>
          <p className="tier1-section-lead font-sans">
            HVAC calls are urgent, seasonal, and they come at night. A furnace
            that quits at 11 PM is a job for whoever picks up. We started where
            a missed call costs the most, and built the receptionist, the board
            and the weekly results around one trade before adding the next.
          </p>
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
