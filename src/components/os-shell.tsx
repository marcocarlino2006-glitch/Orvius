"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  getOsRingMeta,
  osCurrentRing,
  osProductNav,
  osWorkspaceNav,
  osRings,
} from "@/lib/os-nav";
import { company } from "@/lib/company";
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
  businessName,
  statusLabel = "Operations",
  actions,
}: OsShellProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const liveRing = getOsRingMeta(osCurrentRing);

  return (
    <div className="os-shell min-h-screen bg-chalk text-void">
      <aside className="os-sidebar">
        <div className="os-sidebar-inner">
          <Link href="/dashboard" className="os-sidebar-brand">
            <OrviusLogo size="sm" variant="chalk" showOs markOnly />
            <span>
              <span className="os-sidebar-name font-serif">{company.productName}</span>
              <span className="os-sidebar-sub font-sans">OS</span>
            </span>
          </Link>

          <div className="os-ring-status">
            <p className="home-os-kicker">Live</p>
            <p className="mt-2 font-serif text-lg tracking-[-0.03em] text-void">
              {String(osCurrentRing).padStart(2, "0")} · {liveRing?.name}
            </p>
            <p className="mt-1 font-sans text-xs leading-relaxed text-ash">
              {liveRing?.module}
            </p>
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

          <div className="os-user-panel">
            {session?.user ? (
              <>
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
              </>
            ) : null}
          </div>

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

      <div className="os-main">
        <header className="os-topbar">
          <div className="os-topbar-copy">
            <p className="os-topbar-live font-sans">
              <span className="home-os-live-dot" />
              {businessName ?? "Orvius"} · Rings 1–{osCurrentRing} live
            </p>
            <h1 className="os-topbar-title font-serif">{title}</h1>
            {subtitle ? (
              <p className="os-topbar-sub font-sans">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="os-topbar-actions">{actions}</div> : null}
        </header>

        <main className="os-content">{children}</main>
      </div>
    </div>
  );
}
