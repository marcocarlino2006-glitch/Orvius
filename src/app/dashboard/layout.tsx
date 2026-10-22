import { OnboardingGuard } from "@/components/onboarding-guard";
import { RecordDrawerProvider } from "@/components/record-drawer";
import { SettingsCenterHost } from "@/components/settings-center/settings-center-host";
import { Ring1Provider } from "@/lib/ring1-context";
import type { ReactNode } from "react";
import "./dashboard.css";
import "./orvius-system.css";
import "./settings-center.css";
import "./orvius-craft.css";
import "./work.css";
import "./orvius-modern.css";
import "./pages.css";
import "./orvius-calm.css";
import "./orvius-instant.css";

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
