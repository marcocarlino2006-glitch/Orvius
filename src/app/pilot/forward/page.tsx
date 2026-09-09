import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import { demoLineHref } from "@/lib/demo-line";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Forward your line",
  description:
    "How to forward missed and after-hours calls to Orvius — and what Orvius does and does not do.",
};

export default function PilotForwardPage() {
  return (
    <MarketingShell cta={{ href: demoLineHref(), label: "Try the live line" }}>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap" style={{ maxWidth: "40rem" }}>
          <ShellPageIntro
            label="Pilot setup"
            title="Forward your line. Catch what you miss."
            subline="One page for every shop — honest about what Orvius captures"
            description={`${company.productName} answers the Orvius number. Forward missed, busy, and after-hours from your public number — or publish the Orvius line.`}
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap" style={{ maxWidth: "40rem" }}>
          <h2 className="tier1-section-title type-headline">What Orvius does</h2>
          <ul className="mt-4 space-y-2 font-sans text-sm leading-relaxed text-ash">
            <li>Answers the Orvius line (and any calls you forward to it)</li>
            <li>Qualifies: name, phone, service, urgency, address</li>
            <li>Proposes a job window and texts the customer a confirm link</li>
            <li>Texts you the lead summary (email failover if SMS fails)</li>
            <li>Keeps one shop record for leads, jobs, and weekly proof</li>
          </ul>

          <h2 className="tier1-section-title type-headline mt-12">
            What Orvius does not do (yet)
          </h2>
          <ul className="mt-4 space-y-2 font-sans text-sm leading-relaxed text-ash">
            <li>
              Catch calls on your public number <strong>unless you forward</strong>
            </li>
            <li>
              Treat a proposed window as locked until the customer confirms the SMS
              link
            </li>
            <li>
              Pay estimate card money into your shop bank (Stripe Connect later)
            </li>
            <li>Sync Jobber / ServiceTitan</li>
            <li>Guarantee “zero missed jobs” or 100% answer rate</li>
          </ul>

          <h2 className="tier1-section-title type-headline mt-12">
            How to forward
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 font-sans text-sm leading-relaxed text-ash">
            <li>Keep your public number on Google, trucks, and ads.</li>
            <li>
              Set missed / busy / no-answer / after-hours forward to your Orvius
              line (carrier CFNA / CFB / after-hours routing).
            </li>
            <li>Or publish the Orvius line as your main number.</li>
            <li>Place a live test call from your cell → confirm owner SMS.</li>
            <li>
              In Settings, check Missed-call overflow only after forward is real.
            </li>
          </ol>

          <h2 className="tier1-section-title type-headline mt-12">Say this</h2>
          <ul className="mt-4 space-y-2 font-sans text-sm leading-relaxed text-ash">
            <li>
              “We catch what hits the Orvius line — forward missed and after-hours,
              or publish this number.”
            </li>
            <li>“Booked means proposed until the customer confirms.”</li>
            <li>“Card pay on estimates is Orvius checkout until Connect.”</li>
          </ul>

          <div className="tier1-actions" style={{ marginTop: "2.5rem" }}>
            <Link href="/pilot" className="inst-btn inst-btn-primary">
              Book a call audit
            </Link>
            <Link href="/demo" className="inst-btn inst-btn-ghost">
              Run the browser demo
            </Link>
            <Link href="/signin" className="inst-btn inst-btn-ghost">
              Sign in to get your line
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
