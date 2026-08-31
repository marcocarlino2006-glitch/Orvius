import { OnboardingWizard } from "@/components/onboarding-wizard";
import { company } from "@/lib/company";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set up your shop",
  description: `Complete onboarding for your ${company.productName} workspace.`,
};

export default function DashboardOnboardingPage() {
  return <OnboardingWizard />;
}
