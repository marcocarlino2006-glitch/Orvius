"use client";

import Link from "next/link";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { displayPhone } from "@/lib/customer";
import { useBusiness } from "@/lib/use-business";
import { OsIcon } from "@/components/os-icons";
import { OrviusLogo } from "@/components/orvius-logo";
import { OsCommandPalette } from "@/components/os-command-palette";
import { OsSidebarFooter } from "@/components/os-sidebar-footer";
import { PayPromptModal } from "@/components/pay-prompt-modal";
import { Toaster } from "@/components/toaster";
import { osNavCurrent, osProductNav, osWideNav } from "@/lib/os-nav";
import { DARK_QUERY, applyResolvedTheme, readThemeChoice, resolveTheme } from "@/lib/theme";

type OsShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  businessName?: string;
  statusLabel?: string;
  actions?: React.ReactNode;
};

/** Command and Work speak with their own headline. Every other screen keeps a quiet name. */
function chromeTitle(title: string) {
  if (title === "Command" || title === "Work") return null;
  return title;
}

export function OsShell({
  children,
  title,
  subtitle,
  businessName: businessNameProp,
  actions,
}: OsShellProps) {
  const pathname = usePathname();
  const { business, loading: businessLoading } = useBusiness();
  const businessName = businessNameProp ?? business?.name ?? "Your business";
  const [paletteOpen, setPaletteOpen] = useState(false);
  /*
    Decided on the server, against the shop's own hours and timezone. Reading
    the browser clock here would have been two lines shorter and wrong in two
    ways: it disagrees with the server during hydration, and it would tell a
    shop that answers until eight that it is after hours at six.
  */
  const offHours = business?.signals.afterHoursNow ?? false;
  const onSettings = pathname.startsWith("/dashboard/settings");
  /* Shown only when the line is not simply answering; a normal day needs no banner. */
  const lineAlert = businessLoading || business?.testMode || (business?.sample && !business.line)
    ? null
    : business?.line
      ? offHours
        ? "After hours"
        : null
      : onSettings
        ? null
        : "Line not set up";
  const pageName = chromeTitle(title);

  useEffect(() => {
    if (readThemeChoice() !== "system") return;
    const query = window.matchMedia(DARK_QUERY);
    const onChange = () => applyResolvedTheme(resolveTheme("system"));
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

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

  const line = businessLoading ? (
    "Checking line…"
  ) : business?.line ? (
    <>
      <span className="os-ring-status-dot" aria-hidden />
      {displayPhone(business.line)}
    </>
  ) : business?.testMode ? (
    <>
      Test mode ·{" "}
      <Link href="/dashboard/onboarding?step=live" className="os-sidebar-inline-link">
        Go live
      </Link>
    </>
  ) : business?.sample ? (
    "Demo — calls are simulated"
  ) : onSettings ? (
    "Set your line below"
  ) : (
    <>
      Line not set ·{" "}
      <Link href="/dashboard/onboarding" className="os-sidebar-inline-link">
        Finish setup
      </Link>
    </>
  );

  return (
    <div className="os-shell os-shell-pro os-shell-night min-h-screen">
      <Toaster />
      <aside className="os-sidebar os-sidebar-pro">
        <div className="os-sidebar-inner">
          <Link href="/dashboard" className="os-sidebar-brand" aria-label="Orvius">
            <OrviusLogo size="md" variant="void" />
          </Link>
          <nav className="os-sidebar-nav" aria-label="Shop">
            <ul>
              {osWideNav.map((item) => {
                const active = osNavCurrent(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`os-nav-link${active ? " os-nav-link-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                    >
                      <OsIcon name={item.icon} />
                      <span className="os-nav-label">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </aside>

      <div className="os-main os-main-pro">
        <header className="os-topbar os-topbar-pro os-topbar-night">
          <div className="os-topbar-identity">
            <Link href="/dashboard" className="os-topbar-brand" aria-label="Orvius">
              <OrviusLogo size="md" variant="void" />
            </Link>
            <div className="os-topbar-shop">
              <p className="os-topbar-shop-name font-sans">{businessName}</p>
              <p className="os-topbar-shop-line font-sans">{line}</p>
              {pageName ? <h1 className="os-topbar-page font-sans">{pageName}</h1> : null}
              {pageName && subtitle ? <p className="os-topbar-sub font-sans">{subtitle}</p> : null}
            </div>
          </div>
          <div className="os-topbar-actions">
            {lineAlert ? (
              <span className={`os-line-alert font-sans${business?.line ? "" : " is-off"}`} title={lineAlert} aria-label={lineAlert}>{lineAlert}</span>
            ) : null}
            <button
              type="button"
              className="os-topbar-search os-topbar-search--mark font-sans"
              aria-label="Search"
              title="Search"
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
            </button>
            {actions}
            <OsSidebarFooter />
          </div>
        </header>

        {business?.testMode ? (
          <div className="os-test-banner font-sans" role="status">
            <span>
              <strong>Test mode.</strong> What you see here came from your test call. Calls and texts are simulated; nothing reaches a real person.
            </span>
            <Link href="/dashboard/onboarding?step=live" className="os-test-banner-cta">
              Go live
            </Link>
          </div>
        ) : null}
        <main className="os-content os-content-pro">{children}</main>
        <div className="os-phone-dock">
          <button
            type="button"
            className={`os-phone-search${paletteOpen ? " is-active" : ""}`}
            aria-label="Search"
            aria-expanded={paletteOpen}
            aria-haspopup="dialog"
            onClick={() => setPaletteOpen(true)}
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span>Search</span>
          </button>
          <nav className="os-tabbar" aria-label="Shop">
            {osProductNav.map((item) => {
              const active = osNavCurrent(pathname, item.href);
              return (
                <Link key={item.href} href={item.href} className={`os-tab${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
                  <span className="os-tab-icon">
                    <OsIcon name={item.icon} />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <KeyboardShortcuts />
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
