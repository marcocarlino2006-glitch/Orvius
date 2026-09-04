"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  osCurrentRing,
  osProductNav,
  osWorkspaceNav,
} from "@/lib/os-nav";
import { useBusiness } from "@/lib/use-business";
import { usePlanAccess } from "@/lib/use-plan-access";
import { getPlanById } from "@/lib/pricing-plans";
import { minimumPlanForModule, navHrefToModule } from "@/lib/plan-features";
import { OrviusLogo } from "@/components/orvius-logo";
import { OsAskDock } from "@/components/os-ask-dock";
import { OsMobileNavBackdrop, OsMobileNavButton } from "@/components/os-mobile-nav";
import { OsSidebarFooter } from "@/components/os-sidebar-footer";
import { PayPromptModal } from "@/components/pay-prompt-modal";

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
  const { access } = usePlanAccess();
  const businessName = businessNameProp ?? business?.name ?? "Your business";
  const newLeads = business?.metrics.newLeads ?? 0;
  const showAskDock = access?.canAccess("ask") ?? false;
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  const sidebar = (
    <div className="os-sidebar-inner">
      <Link href="/dashboard" className="os-sidebar-brand">
            <OrviusLogo size="md" variant="void" />
      </Link>

      <div className="os-ring-status os-ring-status-pro">
        <p className="os-sidebar-label font-sans">Your shop</p>
        <p className="os-ring-status-title font-sans">{businessName}</p>
        <p className="os-ring-status-module font-sans">
          {business?.line ?? (
            <>
              Line not set ·{" "}
              <Link href="/dashboard/settings" className="os-sidebar-inline-link">
                Settings
              </Link>
            </>
          )}
        </p>
      </div>

      <nav className="os-sidebar-nav" aria-label="Daily work">
        <p className="os-sidebar-label font-sans">Daily work</p>
        <ul>
          {osProductNav.map((item) => {
            const ring = item.ring ?? osCurrentRing;
            const ringEnabled = ring <= osCurrentRing + 1;
            const navModule = navHrefToModule(item.href);
            const planAllowed = navModule
              ? (access?.canAccess(navModule) ?? true)
              : true;
            const enabled = ringEnabled && planAllowed;
            const active = navActive(pathname, item.href);
            const badge =
              item.href === "/dashboard/inbox" && newLeads > 0
                ? String(newLeads)
                : item.badge;
            const upgradePlan = navModule
              ? getPlanById(minimumPlanForModule(navModule))
              : null;

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
                ) : planAllowed === false &&
                  (access?.effectivePlan === "expired" ||
                    access?.entitled === false) ? (
                  <Link
                    href="/dashboard/billing"
                    className="os-nav-link os-nav-link-locked font-sans"
                    title="Subscribe to continue"
                  >
                    <span>{item.label}</span>
                    <span className="os-nav-lock">Pay</span>
                  </Link>
                ) : planAllowed === false && upgradePlan ? (
                  <Link
                    href="/dashboard/pricing"
                    className="os-nav-link os-nav-link-locked font-sans"
                    title={`Upgrade to ${upgradePlan.name}`}
                  >
                    <span>{item.label}</span>
                    <span className="os-nav-lock">Pro</span>
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

      <nav className="os-sidebar-nav" aria-label="Account">
        <p className="os-sidebar-label font-sans">Account</p>
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
  );

  return (
    <div className="os-shell os-shell-pro min-h-screen">
      <OsMobileNavBackdrop open={navOpen} onClose={() => setNavOpen(false)} />

      <aside
        className={`os-sidebar os-sidebar-pro ${navOpen ? "os-sidebar-open" : ""}`}
        aria-hidden={!navOpen ? undefined : false}
      >
        {sidebar}
      </aside>

      <div className="os-main os-main-pro">
        <header className="os-topbar os-topbar-pro">
          <div className="os-topbar-row">
            <OsMobileNavButton open={navOpen} onToggle={() => setNavOpen((v) => !v)} />
            <div className="os-topbar-copy">
              <p className="os-topbar-live font-sans">
                <span className="pro-live-dot" />
                {newLeads > 0
                  ? `${newLeads} lead${newLeads === 1 ? "" : "s"} need follow-up`
                  : business?.line
                    ? business.line
                    : "Finish setup in Settings"}
              </p>
              <h1 className="os-topbar-title font-sans">{title}</h1>
              {subtitle ? (
                <p className="os-topbar-sub font-sans">{subtitle}</p>
              ) : null}
            </div>
          </div>
          {actions ? <div className="os-topbar-actions">{actions}</div> : null}
        </header>

        <main className="os-content os-content-pro">{children}</main>
        {showAskDock ? <OsAskDock /> : null}
        <PayPromptModal />
      </div>
    </div>
  );
}
