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

const LIST_ROUTES = ["/dashboard/inbox", "/dashboard/calls", "/dashboard/customers", "/dashboard/jobs"];
const LIST_ROWS = [0, 1, 2, 3, 4, 5, 6];

export default function DashboardLoading() {
  const pathname = usePathname() ?? "/dashboard";
  if (LIST_ROUTES.includes(pathname)) {
    return (
      <OsShell title={titleForPath(pathname)}>
        <section className="dashboard-list-loading" aria-busy="true">
          <p className="sr-only" role="status">
            Loading…
          </p>
          <div className="dashboard-list-loading-bar">
            <span className="skeleton" />
            <span className="skeleton" />
          </div>
          {LIST_ROWS.map((row) => (
            <div key={row} className="dashboard-list-loading-row">
              <span className="skeleton dashboard-list-loading-dot" />
              <span className="dashboard-list-loading-text">
                <span className="skeleton" style={{ width: `${62 - (row % 3) * 12}%` }} />
                <span className="skeleton" style={{ width: `${38 + (row % 2) * 14}%` }} />
              </span>
              <span className="skeleton dashboard-list-loading-meta" />
            </div>
          ))}
        </section>
      </OsShell>
    );
  }
  return (
    <OsShell title={titleForPath(pathname)}>
      <section className="dashboard-route-loading" aria-busy="true">
        <p className="sr-only" role="status">
          Loading the latest shop state…
        </p>
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
