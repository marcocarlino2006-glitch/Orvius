"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { pricing } from "@/lib/company";
import { supportMailto } from "@/lib/support";
import { fetchAccount } from "@/lib/account-client";

type AccountData = {
  business: {
    name: string;
    billingStatus: string;
    billingPlan: string | null;
    ownerEmail?: string | null;
    trade?: string | null;
    environment?: string | null;
  } | null;
  billing: {
    status: string;
    planId: string | null;
    plan: { name: string; price: number };
    configured?: boolean;
    entitled?: boolean;
  };
};

type MenuItem = {
  href: string;
  label: string;
  icon: "account" | "personalization" | "settings" | "home" | "help" | "docs";
  external?: boolean;
};

const accountLinks: MenuItem[] = [
  { href: "/dashboard?settings=account", label: "Account", icon: "account" },
  { href: "/dashboard?settings=receptionist", label: "Receptionist", icon: "personalization" },
  { href: "/dashboard?settings=general", label: "Settings", icon: "settings" },
];

const moreLinks: MenuItem[] = [
  { href: "/", label: "Homepage", icon: "home" },
  { href: "help", label: "Get help", icon: "help", external: true },
  { href: "/resources", label: "Docs", icon: "docs" },
];

function initials(name: string | null | undefined, email: string | null | undefined) {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0]?.slice(0, 2).toUpperCase() ?? "OR";
  }
  return email?.slice(0, 2).toUpperCase() ?? "OR";
}

function planDisplayLabel(account: AccountData | null): string {
  const status = account?.billing?.status ?? account?.business?.billingStatus ?? "none";

  if (status === "pilot") return pricing.pilot.name;
  if (status === "active" || status === "past_due") {
    return account?.billing?.plan?.name ?? "Active plan";
  }
  if (status === "canceled") return "Canceled";
  return "No plan";
}

function workspaceLabel(role: "Owner" | "Member" | null): string {
  return role === "Member" ? "Member" : "Personal";
}

export function OsSidebarFooter() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<AccountData | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    fetchAccount()
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setAccount(data);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!session?.user) return null;

  const name = session.user.name ?? "User";
  const email = session.user.email ?? "";
  const planLabel = planDisplayLabel(account);
  const ownerEmail = account?.business?.ownerEmail?.toLowerCase() ?? null;
  const role: "Owner" | "Member" | null = !account
    ? null
    : ownerEmail && email.toLowerCase() === ownerEmail
      ? "Owner"
      : "Member";
  const environment = account?.business?.environment ?? "production";
  const sampleWorkspace = environment === "demo" || environment === "test";
  const billingStatus = (account?.billing?.status ?? account?.business?.billingStatus ?? "").toLowerCase();
  const upgradeLabel = billingStatus === "past_due" ? "Fix payment" : "Upgrade";
  const workspace = workspaceLabel(role);

  return (
    <div
      ref={rootRef}
      className={`os-profile-menu os-sidebar-footer font-sans ${open ? "os-profile-menu-open" : ""}`}
    >
      {sampleWorkspace ? (
        <p className="os-sidebar-env" role="status">
          {environment === "test" ? "Test workspace — not a real shop" : "Demo workspace — sample data"}
        </p>
      ) : null}

      {open ? (
        <div
          id={menuId}
          className="os-profile-menu-panel mn-menu"
          role="menu"
          aria-label="Account menu"
        >
          <div className="pm-identity mn-identity">
            <span className="mn-avatar" aria-hidden>
              {initials(session.user.name, session.user.email)}
            </span>
            <div className="pm-identity-copy">
              <p className="pm-name">{name}</p>
              <p className="pm-email">{workspace}</p>
            </div>
          </div>

          <div className="mn-plan">
            <span className="mn-plan-name">{planLabel}</span>
            <Link href="/dashboard?settings=billing" className="mn-upgrade" onClick={() => setOpen(false)}>
              {upgradeLabel}
            </Link>
          </div>

          <div className="os-profile-menu-links mn-links">
            {accountLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                className="os-profile-menu-link mn-link"
                onClick={() => setOpen(false)}
              >
                <MenuIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          <div className="os-profile-menu-links mn-links mn-links-more">
            {moreLinks.map((item) =>
              item.external ? (
                <a
                  key={item.label}
                  href={supportMailto({ subject: "Help", path: pathname })}
                  role="menuitem"
                  className="os-profile-menu-link mn-link"
                  onClick={() => setOpen(false)}
                >
                  <MenuIcon name={item.icon} />
                  <span>{item.label}</span>
                  <MenuIcon name="external" />
                </a>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  className="os-profile-menu-link mn-link"
                  onClick={() => setOpen(false)}
                >
                  <MenuIcon name={item.icon} />
                  <span>{item.label}</span>
                  <MenuIcon name="external" />
                </Link>
              ),
            )}
          </div>

          <div className="os-profile-menu-footer">
            <button
              type="button"
              role="menuitem"
              className="os-profile-menu-signout mn-signout"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <MenuIcon name="signout" />
              Sign out
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="os-sidebar-user"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="os-sidebar-avatar" aria-hidden>
          {initials(session.user.name, session.user.email)}
        </span>
        <span className="os-sidebar-user-meta">
          <span className="os-sidebar-user-name">{name}</span>
          <span className="os-sidebar-user-plan">{workspace}</span>
        </span>
        <span className="os-profile-menu-chevron" aria-hidden>
          <svg viewBox="0 0 12 12" aria-hidden>
            <path d={open ? "M3 7.5L6 4.5l3 3" : "M3 4.5l3 3 3-3"} stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </button>
    </div>
  );
}

const MENU_PATHS: Record<MenuItem["icon"] | "external" | "signout", string> = {
  account: "M12 12a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM5.2 19.2a6.8 6.8 0 0 1 13.6 0",
  personalization: "M12 3.2 13.6 8l4.9.3-3.8 3.1 1.2 4.8L12 13.6 7.1 16.2l1.2-4.8L4.5 8.3 9.4 8 12 3.2Z",
  settings: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM12 3.2v1.6M12 19.2v1.6M5.2 5.2l1.1 1.1M17.7 17.7l1.1 1.1M3.2 12h1.6M19.2 12h1.6M5.2 18.8l1.1-1.1M17.7 6.3l1.1-1.1",
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.6 9.5a2.4 2.4 0 1 1 3.2 2.3c-.5.2-.8.7-.8 1.2V14M12 17v.2",
  docs: "M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1ZM14 3.5V8h4.5",
  external: "M14 5h5v5M19 5l-8 8M16 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h4",
  signout: "M10 7V5a1 1 0 0 1 1-1h8v16h-8a1 1 0 0 1-1-1v-2M4 12h10M11 9l3 3-3 3",
};

function MenuIcon({ name }: { name: keyof typeof MENU_PATHS }) {
  return (
    <svg className="mn-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={MENU_PATHS[name]} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
