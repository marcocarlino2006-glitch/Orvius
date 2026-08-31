"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  getOsRingMeta,
  osCurrentRing,
  osProductNav,
  osWorkspaceNav,
  osRings,
} from "@/lib/os-nav";
import { OrviusLogo } from "@/components/orvius-logo";

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
  const { data: session } = useSession();
  const liveRing = getOsRingMeta(osCurrentRing);
  const [businessName, setBusinessName] = useState(businessNameProp ?? "Your shop");

  useEffect(() => {
    if (businessNameProp) {
      setBusinessName(businessNameProp);
      return;
    }

    fetch("/api/ring1")
      .then((res) => res.json())
      .then((data) => {
        if (data.business?.name) setBusinessName(data.business.name);
      })
      .catch(() => null);
  }, [businessNameProp]);

  return (
    <div className="os-shell os-shell-pro min-h-screen">
      <aside className="os-sidebar os-sidebar-pro">
        <div className="os-sidebar-inner">
          <Link href="/dashboard" className="os-sidebar-brand">
            <OrviusLogo size="md" variant="void" showOs />
          </Link>

          <div className="os-ring-status os-ring-status-pro">
            <p className="os-sidebar-label font-sans">Current ring</p>
            <p className="os-ring-status-title font-sans">
              {String(osCurrentRing).padStart(2, "0")} · {liveRing?.name}
            </p>
            <p className="os-ring-status-module font-sans">{liveRing?.module}</p>
          </div>

          <nav className="os-sidebar-nav" aria-label="Product">
            <p className="os-sidebar-label font-sans">Product</p>
            <ul>
              {osProductNav.map((item) => {
                const ring = item.ring ?? osCurrentRing;
                const enabled = ring <= osCurrentRing + 1;
                const active = navActive(pathname, item.href);

                return (
                  <li key={item.href}>
                    {enabled ? (
                      <Link
                        href={item.href}
                        className={`os-nav-link font-sans ${active ? "os-nav-link-active" : ""}`}
                      >
                        <span>{item.label}</span>
                        {item.badge ? (
                          <span className="os-nav-badge">{item.badge}</span>
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

          <nav className="os-sidebar-nav" aria-label="Workspace">
            <p className="os-sidebar-label font-sans">Workspace</p>
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

          {session?.user ? (
            <div className="os-user-panel os-user-panel-pro">
              <p className="os-sidebar-label font-sans">Signed in</p>
              <p className="os-user-name font-sans">{session.user.name ?? "User"}</p>
              <p className="os-user-email font-sans">{session.user.email}</p>
              <button
                type="button"
                className="os-sign-out font-sans"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign out
              </button>
            </div>
          ) : null}

          <div className="os-sidebar-rings">
            <p className="os-sidebar-label font-sans">OS map</p>
            <ol className="os-sidebar-ring-list">
              {osRings.slice(0, 5).map((ring) => (
                <li
                  key={ring.ring}
                  className={`os-sidebar-ring-item font-sans ${
                    ring.ring === osCurrentRing ? "os-sidebar-ring-live" : ""
                  } ${ring.status === "next" ? "os-sidebar-ring-next" : ""}`}
                >
                  <span>{String(ring.ring).padStart(2, "0")}</span>
                  <span>{ring.name}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </aside>

      <div className="os-main os-main-pro">
        <header className="os-topbar os-topbar-pro">
          <div className="os-topbar-copy">
            <p className="os-topbar-live font-sans">
              <span className="home-os-live-dot" />
              {businessName} · Rings 1–{osCurrentRing} live
            </p>
            <h1 className="os-topbar-title font-sans">{title}</h1>
            {subtitle ? (
              <p className="os-topbar-sub font-sans">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="os-topbar-actions">{actions}</div> : null}
        </header>

        <main className="os-content os-content-pro">{children}</main>
      </div>
    </div>
  );
}
