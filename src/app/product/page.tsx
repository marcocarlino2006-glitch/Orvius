import { HomeLiveCall } from "@/components/home-live-call";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { StartActions } from "@/components/start-actions";
import { company } from "@/lib/company";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/product" },
  title: "Product",
  description: `${company.productName} — ${company.categoryClaim} ${company.proofLine}`,
};

const steps = [
  {
    id: "01",
    title: "Bring in the work.",
    body: "Calls are answered in your business's name, in English or Spanish. Problem, urgency, address and callback go on the customer record as the caller says them. Gas, smoke and medical emergencies get safety steps first, then you.",
  },
  {
    id: "02",
    title: "Schedule it.",
    body: "The job goes on your real calendar in an open window, with someone free who has the skill. If another call takes that person first, it moves to the next open slot instead of double-booking.",
  },
  {
    id: "03",
    title: "Coordinate people and follow up.",
    body: "Whoever is going gets the address and one tap to call. The customer gets the time with one tap to confirm. Callers nobody reached get a follow-up, and a caller who wants a person is transferred to you or put on your board for a callback.",
  },
  {
    id: "04",
    title: "Show what actually happened.",
    body: "Every call recorded and graded, every booking and text in the activity log, and each week the calls answered, jobs booked, jobs done and money collected, in numbers you can check against your own books.",
  },
] as const;

export default function ProductPage() {
  const signupOpen = getPublicLaunchReadiness().ready;
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact ov-product-hero">
        <div className="editorial-wrap ov-product-hero-grid">
          <ShellPageIntro
            label="Product"
            title="Run your day in Orvius."
            subline="The receptionist brings in the work. Command runs it from there."
            description="Calls are answered and booked on your real schedule. Command assigns the job to someone free with the right skill, texts them the address, confirms with the customer, follows up when nobody called back, and shows you each step."
            actions={
              <StartActions signupOpen={signupOpen} />
            }
          />
          <div className="ov-product-stage">
            <HomeLiveCall />
          </div>
        </div>
      </section>

      <section className="tier1-story ov-product-sequence">
        <div className="editorial-wrap">
          <ol className="mkt-laws mkt-laws--ruled font-sans">
            {steps.map((c) => (
              <li key={c.id} className="mkt-law mkt-law--ruled">
                <span className="mkt-law-index" aria-hidden>
                  {c.id}
                </span>
                <div className="mkt-law-copy">
                  <h2 className="mkt-law-title">{c.title}</h2>
                  <p className="mkt-law-body">{c.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="tier1-story tier1-story-muted tier1-bridge ov-surface-anchor">
        <div className="editorial-wrap tier1-story-grid">
          <div>
            <h2 className="tier1-section-title type-headline">
              Hear it on a real line.
            </h2>
            <p className="tier1-section-lead font-sans">
              Dial the live line and play a customer.{" "}
              {signupOpen
                ? "Then set up your own and hear a test call before you pay."
                : "Or book a call audit for your business."}
            </p>
          </div>
          <div className="tier1-actions">
            <StartActions signupOpen={signupOpen} />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
