"use client";

import { OsShell } from "@/components/os-shell";
import { usePathname } from "next/navigation";

const TITLES: Record<string, string> = {
  "/dashboard": "Command",
  "/dashboard/inbox": "Inbox",
  "/dashboard/calls": "Calls",
  "/dashboard/customers": "Customers",
  "/dashboard/jobs": "Jobs",
  "/dashboard/dispatch": "Dispatch",
  "/dashboard/ask": "Ask",
  "/dashboard/settings": "Settings",
  "/dashboard/billing": "Billing",
  "/dashboard/profile": "Profile",
  "/dashboard/pricing": "Pricing",
  "/dashboard/onboarding": "Setup",
};

function titleForPath(pathname: string) {
  if (TITLES[pathname]) return TITLES[pathname];
  const match = Object.keys(TITLES)
    .filter((key) => key !== "/dashboard" && pathname.startsWith(`${key}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? TITLES[match] : "Orvius";
}

export default function DashboardLoading() {
  const pathname = usePathname() ?? "/dashboard";
  return (
    <OsShell
      title={titleForPath(pathname)}
      subtitle="Loading the latest shop state…"
    >
      <section className="dashboard-route-loading" aria-busy="true">
        <div className="dashboard-route-loading-main">
          <span className="skeleton dashboard-route-loading-value" />
          <div className="dashboard-route-loading-metrics">
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
        </div>
        <aside className="dashboard-route-loading-rail">
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </aside>
      </section>
    </OsShell>
  );
}
