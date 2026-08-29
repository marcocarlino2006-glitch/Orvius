import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Subscription confirmed",
  description: "Your Orvius Pro subscription is being activated.",
};

export default function BillingSuccessPage() {
  return (
    <MarketingShell cta={false}>
      <section className="editorial-hero">
        <div className="editorial-wrap max-w-3xl">
          <ShellPageIntro
            label="Billing"
            title="You're subscribed to Orvius Pro."
            description={`Thank you. ${company.legalName} will activate billing on your account and keep your line running without interruption.`}
          />
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-wrap max-w-3xl">
          <div className="panel-chalk p-6 md:p-8">
            <ol className="list-decimal space-y-3 pl-5 font-sans text-sm leading-relaxed text-ash">
              <li>
                Check your email for the Stripe receipt from {company.legalName}.
              </li>
              <li>
                Confirm leads still flow in{" "}
                <Link href="/dashboard" className="editorial-link">
                  your dashboard
                </Link>
                .
              </li>
              <li>
                Need help? Email{" "}
                <a
                  href={`mailto:${company.contactEmail}`}
                  className="editorial-link"
                >
                  {company.contactEmail}
                </a>
                .
              </li>
            </ol>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard" className="editorial-cta">
                Open dashboard
              </Link>
              <Link href="/admin" className="editorial-link">
                Business setup →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
