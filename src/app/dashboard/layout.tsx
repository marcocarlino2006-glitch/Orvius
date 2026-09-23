import { OnboardingGuard } from "@/components/onboarding-guard";
import { Ring1Provider } from "@/lib/ring1-context";
import type { ReactNode } from "react";
import "./dashboard.css";
import "../orvius-mission-control.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <OnboardingGuard>
      <Ring1Provider>{children}</Ring1Provider>
    </OnboardingGuard>
  );
}
