import {
  MarketingShell,
  ShellPageIntro,
  ShellVoidPanel,
} from "@/components/marketing-shell";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Subscription confirmed",
  description: "Your Orvius Pro subscription is being activated.",
};

export default function BillingSuccessPage() {
  return (
    <MarketingShell headerPosition="sticky" cta={false} atmosphere>
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-28 md:px-8 md:pt-32">
        <ShellPageIntro
          label="Billing"
          title="You're subscribed to Orvius Pro."
          description={`Thank you. ${company.legalName} will activate billing on your account and keep your line running without interruption.`}
        />

        <ShellVoidPanel className="mt-10 p-6 md:p-8">
          <ol className="list-decimal space-y-3 pl-5 font-sans text-sm leading-relaxed text-ash-soft">
            <li>Check your email for the Stripe receipt from {company.legalName}.</li>
            <li>
              Confirm leads still flow in{" "}
              <Link href="/dashboard" className="footer-link text-chalk">
                your dashboard
              </Link>
              .
            </li>
            <li>
              Need help? Email{" "}
              <a
                href={`mailto:${company.contactEmail}`}
                className="footer-link text-chalk"
              >
                {company.contactEmail}
              </a>
              .
            </li>
          </ol>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/dashboard" className="btn btn-on-void justify-center">
              Open dashboard
            </Link>
            <Link
              href="/admin"
              className="btn btn-on-void-secondary justify-center"
            >
              Business setup
            </Link>
          </div>
        </ShellVoidPanel>
      </main>
    </MarketingShell>
  );
}
