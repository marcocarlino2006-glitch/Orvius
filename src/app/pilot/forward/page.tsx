import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import { demoLineHref } from "@/lib/demo-line";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Put Orvius on your number",
  description:
    "How to send every call on the number you already advertise to Orvius — and what Orvius does and does not do.",
};

export default function PilotForwardPage() {
  return (
    <MarketingShell cta={{ href: demoLineHref(), label: "Try the live line" }}>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap" style={{ maxWidth: "40rem" }}>
          <ShellPageIntro
            label="Pilot setup"
            title="Put Orvius on the number you already use."
            subline="One page for every shop — honest about what Orvius captures"
            description={`${company.productName} answers the number customers already call, once you send every call there. The Orvius number is only where your carrier sends them.`}
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap" style={{ maxWidth: "40rem" }}>
          <h2 className="tier1-section-title type-headline">What Orvius does</h2>
          <ul className="mt-4 space-y-2 font-sans text-sm leading-relaxed text-ash">
            <li>Answers every call you send from the number customers already call</li>
            <li>Qualifies: name, phone, service, urgency, address</li>
            <li>Books an open time on the call, checked against your jobs and calendar</li>
            <li>Texts you the lead summary (email backup if a text can&apos;t deliver)</li>
            <li>Keeps one shop record for leads, jobs, and weekly proof</li>
          </ul>

          <h2 className="tier1-section-title type-headline mt-12">
            What Orvius does not do (yet)
          </h2>
          <ul className="mt-4 space-y-2 font-sans text-sm leading-relaxed text-ash">
            <li>
              Catch calls on your public number <strong>unless you forward</strong>. Orvius can&apos;t change your carrier&apos;s setting.
            </li>
            <li>Quote a price you haven&apos;t listed, or promise an arrival time that didn&apos;t come from your schedule</li>
            <li>
              Take card money into your shop bank until you finish{" "}
              <Link href="/dashboard/billing#payouts" className="underline underline-offset-2">
                Billing → payouts
              </Link>{" "}
              (Stripe Connect)
            </li>
            <li>Sync with ServiceTitan or other field-service suites. Jobber and Housecall Pro are supported: requests from your calls go into them.</li>
            <li>Guarantee “zero missed jobs” or 100% answer rate</li>
          </ul>

          <h2 className="tier1-section-title type-headline mt-12">
            How to forward
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 font-sans text-sm leading-relaxed text-ash">
            <li>Keep your public number on Google, trucks, and ads.</li>
            <li>
              From the phone that owns it, dial the every-call code for your carrier
              (Verizon, AT&amp;T, T-Mobile, or your business phone system). That is a
              setting, not an application.{" "}
              <Link href="/help/forward-your-calls" className="underline underline-offset-2">
                Steps and codes by carrier
              </Link>
            </li>
            <li>Or send only the calls you don&apos;t answer, or publish the Orvius line as a new main number.</li>
            <li>Call your business number from another phone. Orvius should answer, and your phone should stay quiet.</li>
            <li>
              Settings marks it working when that call arrives. A line existing is not proof.
            </li>
          </ol>

          <h2 className="tier1-section-title type-headline mt-12">Say this</h2>
          <ul className="mt-4 space-y-2 font-sans text-sm leading-relaxed text-ash">
            <li>
              “Customers keep their number. One code sends every call to Orvius. We only catch what you forward.”
            </li>
            <li>
              “You&apos;re booked for [time].” When they pick a time on the call, that is the appointment. A window
              that was only proposed still needs their confirm text.
            </li>
            <li>
              “Card pay on estimates goes to your shop bank after you finish
              payouts in Billing.”
            </li>
          </ul>

          <div className="tier1-actions" style={{ marginTop: "2.5rem" }}>
            <Link href="/pilot" className="ov-btn ov-btn--solid">
              Book a call audit
            </Link>
            <Link href="/signin" className="ov-btn ov-btn--quiet">
              Sign in to get your line
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
