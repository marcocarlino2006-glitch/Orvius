"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { pricing } from "@/lib/company";

type AccountData = {
  business: {
    name: string;
    billingStatus: string;
  } | null;
  billing: {
    status: string;
    plan: { name: string; price: number };
  };
};

type MenuItem = {
  href: string;
  label: string;
  hint?: string;
  external?: boolean;
};

const accountLinks: MenuItem[] = [
  { href: "/dashboard/profile", label: "Profile", hint: "Account & shop" },
  { href: "/dashboard/settings", label: "Settings", hint: "Line & alerts" },
  { href: "/dashboard/pricing", label: "Pricing", hint: `$${pricing.pro.price}/mo` },
  { href: "/dashboard/billing", label: "Billing", hint: "Plan & invoices" },
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

function billingLabel(status: string) {
  switch (status) {
    case "active":
      return "Orvius Pro";
    case "pilot":
      return "Design partner";
    case "past_due":
      return "Past due";
    case "canceled":
      return "Canceled";
    default:
      return "No plan";
  }
}

export function OsSidebarFooter() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<AccountData | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    fetch("/api/account")
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
  const businessName = account?.business?.name ?? "Your business";
  const planLabel = billingLabel(account?.billing.status ?? "none");

  return (
    <div ref={rootRef} className="os-profile-menu os-sidebar-footer font-sans">
      {open ? (
        <div
          id={menuId}
          className="os-profile-menu-panel"
          role="menu"
          aria-label="Account menu"
        >
          <div className="os-profile-menu-header">
            <span className="os-sidebar-avatar os-profile-menu-avatar" aria-hidden>
              {initials(session.user.name, session.user.email)}
            </span>
            <div className="os-profile-menu-header-copy">
              <p className="os-profile-menu-name">{name}</p>
              <p className="os-profile-menu-email">{email}</p>
              <p className="os-profile-menu-plan">
                {businessName} · {planLabel}
              </p>
            </div>
          </div>

          <div className="os-profile-menu-links">
            {accountLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className="os-profile-menu-link"
                onClick={() => setOpen(false)}
              >
                <span>{item.label}</span>
                {item.hint ? <span className="os-profile-menu-hint">{item.hint}</span> : null}
              </Link>
            ))}
          </div>

          <div className="os-profile-menu-footer">
            <Link
              href="/"
              className="os-profile-menu-link"
              onClick={() => setOpen(false)}
            >
              orvius.im
            </Link>
            <button
              type="button"
              className="os-profile-menu-signout"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
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
        onClick={() => setOpen((value) => !value)}
      >
        <span className="os-sidebar-avatar" aria-hidden>
          {initials(session.user.name, session.user.email)}
        </span>
        <span className="os-sidebar-user-meta">
          <span className="os-sidebar-user-name">{name}</span>
          <span className="os-sidebar-user-email">{planLabel}</span>
        </span>
        <span className="os-profile-menu-chevron" aria-hidden>
          {open ? "▾" : "▴"}
        </span>
      </button>
    </div>
  );
}
