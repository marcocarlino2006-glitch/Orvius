import { OnboardingGuard } from "@/components/onboarding-guard";
import { RecordDrawerProvider } from "@/components/record-drawer";
import { SettingsCenterHost } from "@/components/settings-center/settings-center-host";
import { Ring1Provider } from "@/lib/ring1-context";
import type { ReactNode } from "react";
import "./dashboard.css";
import "./orvius-system.css";
import "./orvius-scale.css";
import "./settings-center.css";
import "./orvius-craft.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <OnboardingGuard>
      <Ring1Provider>
        <RecordDrawerProvider>
          {children}
          <SettingsCenterHost />
        </RecordDrawerProvider>
      </Ring1Provider>
    </OnboardingGuard>
  );
}
