import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import { demoLineHref } from "@/lib/demo-line";
import { workspaceAccessPublicClaim } from "@/lib/seats";
import type { Metadata } from "next";
import Link from "next/link";
import { SIGNUP_HREF } from "@/lib/signup-href";

export const metadata: Metadata = {
  title: "About",
  description: `${company.productName} — ${company.mission} ${company.categoryClaim}`,
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Our mission"
            title={company.mission}
            subline={company.missionWhy}
            description="Orvius starts at the phone: it answers the calls a business can't take, understands what the caller needs, offers an open time from the schedule, and texts the owner what happened."
            actions={
              <>
                <a href={demoLineHref()} className="ov-btn ov-btn--solid">
                  Call the live line
                </a>
                <Link href={SIGNUP_HREF} className="ov-btn ov-btn--quiet">
                  Get started
                </Link>
              </>
            }
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap max-w-3xl">
          <h2 className="tier1-section-title type-headline">Where we&apos;re going.</h2>
          <ol className="mt-6 space-y-6">
            {company.vision.map((step, i) => (
              <li key={step.title}>
                <p className="tier1-eyebrow type-eyebrow">Step {i + 1}</p>
                <h3 className="tier1-section-title type-headline" style={{ fontSize: "1.375rem" }}>
                  {step.title}
                </h3>
                <p className="tier1-section-lead font-sans">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap max-w-3xl">
          <h2 className="tier1-section-title type-headline">Where we are today.</h2>
          <p className="tier1-section-lead font-sans">
            Orvius launches for heating &amp; cooling, plumbing and electrical businesses, where a missed call at 11 PM
            is often an urgent job. Each of those trades has its own rules for what to ask and what counts as an
            emergency. Other kinds of business are on the waitlist until theirs gets the same depth. It answers in
            English and Spanish today.
          </p>
          <p className="tier1-section-lead font-sans">
            Built by {company.legalName}. We use replaceable AI models and own the workflow, data, and actions around
            them. {workspaceAccessPublicClaim()}
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
            <Link href={SIGNUP_HREF} className="ov-btn ov-btn--quiet">
              Get started
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
