import { OnboardingGuard } from "@/components/onboarding-guard";
import { RecordDrawerProvider } from "@/components/record-drawer";
import { Ring1Provider } from "@/lib/ring1-context";
import type { ReactNode } from "react";
import "./dashboard.css";
import "./orvius-system.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <OnboardingGuard>
      <Ring1Provider>
        <RecordDrawerProvider>{children}</RecordDrawerProvider>
      </Ring1Provider>
    </OnboardingGuard>
  );
}
