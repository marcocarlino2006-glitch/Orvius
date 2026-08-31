"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  osCurrentRing,
  osProductNav,
  osWorkspaceNav,
} from "@/lib/os-nav";
import { useBusiness } from "@/lib/use-business";
import { OrviusLogo } from "@/components/orvius-logo";
import { OsAskDock } from "@/components/os-ask-dock";
import { OsSidebarFooter } from "@/components/os-sidebar-footer";

type OsShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  businessName?: string;
  statusLabel?: string;
  actions?: React.ReactNode;
};

function navActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function OsShell({
  children,
  title,
  subtitle,
  businessName: businessNameProp,
  actions,
}: OsShellProps) {
  const pathname = usePathname();
  const { business } = useBusiness();
  const businessName = businessNameProp ?? business?.name ?? "Your business";
  const newLeads = business?.metrics.newLeads ?? 0;

  return (
    <div className="os-shell os-shell-pro min-h-screen">
      <aside className="os-sidebar os-sidebar-pro">
        <div className="os-sidebar-inner">
          <Link href="/dashboard" className="os-sidebar-brand">
            <OrviusLogo size="md" variant="void" showOs />
          </Link>

          <div className="os-ring-status os-ring-status-pro">
            <p className="os-sidebar-label font-sans">Workspace</p>
            <p className="os-ring-status-title font-sans">{businessName}</p>
            <p className="os-ring-status-module font-sans">
              {business?.line ?? "Configure your line in Setup"}
            </p>
          </div>

          <nav className="os-sidebar-nav" aria-label="Operations">
            <p className="os-sidebar-label font-sans">Operations</p>
            <ul>
              {osProductNav.map((item) => {
                const ring = item.ring ?? osCurrentRing;
                const enabled = ring <= osCurrentRing + 1;
                const active = navActive(pathname, item.href);
                const badge =
                  item.href === "/dashboard/inbox" && newLeads > 0
                    ? String(newLeads)
                    : item.badge;

                return (
                  <li key={item.href}>
                    {enabled ? (
                      <Link
                        href={item.href}
                        className={`os-nav-link font-sans ${active ? "os-nav-link-active" : ""}`}
                      >
                        <span>{item.label}</span>
                        {badge ? (
                          <span className="os-nav-badge">{badge}</span>
                        ) : null}
                      </Link>
                    ) : (
                      <span className="os-nav-link os-nav-link-disabled font-sans">
                        {item.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <nav className="os-sidebar-nav" aria-label="Workspace links">
            <p className="os-sidebar-label font-sans">More</p>
            <ul>
              {osWorkspaceNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`os-nav-link font-sans ${
                      navActive(pathname, item.href) ? "os-nav-link-active" : ""
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <OsSidebarFooter />
        </div>
      </aside>

      <div className="os-main os-main-pro">
        <header className="os-topbar os-topbar-pro">
          <div className="os-topbar-copy">
            <p className="os-topbar-live font-sans">
              <span className="pro-live-dot" />
              {businessName}
              {newLeads > 0 ? ` · ${newLeads} new lead${newLeads === 1 ? "" : "s"}` : " · Line active"}
            </p>
            <h1 className="os-topbar-title font-sans">{title}</h1>
            {subtitle ? (
              <p className="os-topbar-sub font-sans">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="os-topbar-actions">{actions}</div> : null}
        </header>

        <main className="os-content os-content-pro">{children}</main>
        <OsAskDock />
      </div>
    </div>
  );
}
