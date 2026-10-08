import { auth } from "@/auth";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { TurnOnOrvius } from "@/components/turn-on-orvius";
import { getBillingReadiness } from "@/lib/billing-readiness";
import { company } from "@/lib/company";
import { resolveShopAccess } from "@/lib/workspace-access";
import type { Metadata } from "next";
import "./turn-on.css";

export const metadata: Metadata = {
  title: "Turn on Orvius",
  description: `Set up your ${company.productName} workspace.`,
};

/* Whether card checkout is open is read from the running environment, not the build. */
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardOnboardingPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const checkoutOpen = getBillingReadiness().checkoutReady;
  const first = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  /* Back from checkout, or a live shop finishing its line: the paid path builds and verifies the number. */
  if (first("session_id")) return <OnboardingWizard checkoutOpen={checkoutOpen} />;
  const email = (await auth())?.user?.email?.toLowerCase();
  const open = email ? (await resolveShopAccess(email))?.business : null;
  if (open?.environment === "production") return <OnboardingWizard checkoutOpen={checkoutOpen} />;

  return <TurnOnOrvius checkoutOpen={checkoutOpen} initialStep={first("step") ?? null} canceled={first("canceled") === "1"} />;
}
