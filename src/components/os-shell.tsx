"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { osCurrentRing, osProductNav } from "@/lib/os-nav";
import { useBusiness } from "@/lib/use-business";
import { usePlanAccess } from "@/lib/use-plan-access";
import { getPlanById } from "@/lib/pricing-plans";
import { minimumPlanForModule, navHrefToModule } from "@/lib/plan-features";
import { OrviusLogo } from "@/components/orvius-logo";
import { OsIcon } from "@/components/os-icons";
import { OsAskDock } from "@/components/os-ask-dock";
import { OsCommandPalette } from "@/components/os-command-palette";
import { OsMobileNavBackdrop, OsMobileNavButton } from "@/components/os-mobile-nav";
import { OsSidebarFooter } from "@/components/os-sidebar-footer";
import { PayPromptModal } from "@/components/pay-prompt-modal";
import { PostLockBanner } from "@/components/post-lock-banner";

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
  const unassignedJobs = business?.signals.unassignedJobs ?? 0;
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

      <div className="os-ring-status">
        <p className="os-sidebar-label font-sans">Shop</p>
        <p className="os-ring-status-title font-sans">{businessName}</p>
        <p className="os-ring-status-module font-sans">
          {business?.line ? (
            <>
              <span className="os-ring-status-dot" aria-hidden />
              {business.line}
            </>
          ) : (
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
                : item.href === "/dashboard/dispatch" && unassignedJobs > 0
                  ? String(unassignedJobs)
                  : item.badge;
            const badgeWarn = item.href === "/dashboard/dispatch" && unassignedJobs > 0;
            const upgradePlan = navModule
              ? getPlanById(minimumPlanForModule(navModule))
              : null;

            return (
              <li key={item.href}>
                {enabled ? (
                  <Link
                    href={item.href}
                    className={`os-nav-link font-sans ${active ? "os-nav-link-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <OsIcon name={item.icon} />
                    <span className="os-nav-label">{item.label}</span>
                    {badge ? (
                      <span
                        className={`os-nav-badge ${badgeWarn ? "os-nav-badge-warn" : ""}`}
                        title={
                          badgeWarn ? "Jobs with no tech assigned" : "New leads waiting"
                        }
                      >
                        {badge}
                      </span>
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
                    <OsIcon name={item.icon} />
                    <span className="os-nav-label">{item.label}</span>
                    <span className="os-nav-lock">Pay</span>
                  </Link>
                ) : planAllowed === false && upgradePlan ? (
                  <Link
                    href="/dashboard/pricing"
                    className="os-nav-link os-nav-link-locked font-sans"
                    title={`Upgrade to ${upgradePlan.name}`}
                  >
                    <OsIcon name={item.icon} />
                    <span className="os-nav-label">{item.label}</span>
                    <span className="os-nav-lock">Pro</span>
                  </Link>
                ) : (
                  <span className="os-nav-link os-nav-link-disabled font-sans">
                    <OsIcon name={item.icon} />
                    <span className="os-nav-label">{item.label}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/*
        Account links live in the profile menu below and nowhere else. This
        corner used to hold both: an "Account" nav section listing Settings,
        Profile and Billing, and directly beneath it a profile button whose
        menu listed the same three. Every shop we watched picked one.
      */}
      <OsSidebarFooter />
    </div>
  );

  return (
    <div className="os-shell os-shell-pro os-shell-night min-h-screen">
      <OsMobileNavBackdrop open={navOpen} onClose={() => setNavOpen(false)} />

      <aside
        className={`os-sidebar os-sidebar-pro ${navOpen ? "os-sidebar-open" : ""}`}
        aria-hidden={!navOpen ? undefined : false}
      >
        {sidebar}
      </aside>

      <div className="os-main os-main-pro">
        <header className="os-topbar os-topbar-pro os-topbar-night">
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
          <div className="os-topbar-actions">
            <button
              type="button"
              className="os-topbar-search font-sans"
              onClick={() => setPaletteOpen(true)}
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M11 11l3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              <span className="os-topbar-search-label">Search</span>
              <kbd>⌘K</kbd>
            </button>
            {actions}
          </div>
        </header>

        <PostLockBanner />
        <main className="os-content os-content-pro">{children}</main>
        {showAskDock ? <OsAskDock /> : null}
        <OsCommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          shopLine={business?.line ?? null}
        />
        <PayPromptModal />
      </div>
    </div>
  );
}
