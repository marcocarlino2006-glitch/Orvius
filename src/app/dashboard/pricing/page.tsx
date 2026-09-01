"use client";

import { OsShell } from "@/components/os-shell";
import { PricingPlanCard } from "@/components/pricing-plan-card";
import { pricingPlans } from "@/lib/company";
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
      <div className="account-grid account-grid-plans">
        {pricingPlans.map((plan) => (
          <PricingPlanCard key={plan.id} plan={plan} email={email} layout="dashboard" />
        ))}
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
