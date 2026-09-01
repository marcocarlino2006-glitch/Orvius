"use client";

import { CheckoutButton } from "@/components/checkout-button";
import { OsShell } from "@/components/os-shell";
import { ShellPanel } from "@/components/shell-primitives";
import { company, pricing } from "@/lib/company";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function DashboardPricingPage() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";

  return (
    <OsShell
      title="Pricing"
      subtitle="Flat monthly pricing — no per-minute billing, no surprises."
    >
      <div className="account-grid">
        <ShellPanel title={pricing.pilot.name}>
          <p className="font-sans text-2xl font-semibold tracking-[-0.03em] text-void">
            ${pricing.pilot.price}
            <span className="text-base font-medium text-ash"> / {pricing.pilot.period}</span>
          </p>
          <p className="mt-2 font-sans text-sm text-ash">{pricing.pilot.limit}</p>
          <ul className="account-plan-list font-sans">
            {pricing.pilot.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Link href="/pilot" className="btn btn-secondary mt-5 text-sm">
            {pricing.pilot.cta}
          </Link>
        </ShellPanel>

        <ShellPanel title={pricing.pro.name}>
          <p className="font-sans text-2xl font-semibold tracking-[-0.03em] text-void">
            ${pricing.pro.price}
            <span className="text-base font-medium text-ash"> / {pricing.pro.period}</span>
          </p>
          <p className="mt-2 font-sans text-sm text-ash">
            Unlimited inbound · cancel anytime
          </p>
          <ul className="account-plan-list font-sans">
            {pricing.pro.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="mt-5">
            <CheckoutButton
              label={`Subscribe · $${pricing.pro.price}/mo`}
              variant="primary"
              email={email}
            />
          </div>
          <p className="mt-3 font-sans text-xs text-ash">
            Billed by {company.legalName} when checkout is live
          </p>
        </ShellPanel>
      </div>

      <p className="mt-6 font-sans text-sm text-ash">
        Manage your subscription on the{" "}
        <Link href="/dashboard/billing" className="pro-section-link">
          Billing
        </Link>{" "}
        page.
      </p>
    </OsShell>
  );
}
