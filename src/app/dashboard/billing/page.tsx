"use client";

import { BillingContent } from "@/components/billing-content";
import { OsShell } from "@/components/os-shell";

export default function DashboardBillingPage() {
  return (
    <OsShell title="Billing">
      <BillingContent />
    </OsShell>
  );
}
