import { OnboardingGuard } from "@/components/onboarding-guard";
import type { ReactNode } from "react";
import "./dashboard.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <OnboardingGuard>{children}</OnboardingGuard>;
}
