import { redirect } from "next/navigation";

/** One billing surface — Pricing lives on /pricing publicly. */
export default function DashboardPricingPage() {
  redirect("/dashboard/billing");
}
