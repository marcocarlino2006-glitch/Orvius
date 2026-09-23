"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { pricing } from "@/lib/company";
import { supportEmail, supportMailto } from "@/lib/support";

type AccountData = {
  business: {
    name: string;
    billingStatus: string;
    billingPlan: string | null;
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
  hint?: string;
};

/*
  Profile + Settings for setup, Billing for payouts when Attention says
  "Open payouts" — three links so money recovery is not buried.
*/
const accountLinks: MenuItem[] = [
  { href: "/dashboard/profile", label: "Profile", hint: "You & your shop" },
  { href: "/dashboard/settings", label: "Settings", hint: "Line, alerts & capture" },
  { href: "/dashboard/billing", label: "Billing", hint: "Plan & payouts" },
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

function needsPayCta(account: AccountData | null): boolean {
  const status = (
    account?.billing?.status ??
    account?.business?.billingStatus ??
    "none"
  ).toLowerCase();
  if (status === "active") return false;
  if (status === "past_due" || status === "canceled") return true;
  if (account?.billing?.entitled === false) return true;
  if (status === "pilot" || status === "none") return true;
  return false;
}

export function OsSidebarFooter() {
  const { data: session } = useSession();
  const pathname = usePathname();
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
  const planLabel = planDisplayLabel(account);
  const showPay = needsPayCta(account);
  const payLabel =
    (account?.billing?.status ?? "").toLowerCase() === "past_due"
      ? "Fix payment"
      : "Pay with card";

  return (
    <div
      ref={rootRef}
      className={`os-profile-menu os-sidebar-footer font-sans ${open ? "os-profile-menu-open" : ""}`}
    >
      {showPay && pathname !== "/dashboard/billing" ? (
        <Link
          href="/dashboard/billing"
          className="os-sidebar-pay"
          title="Open Billing to pay with card"
        >
          {payLabel}
        </Link>
      ) : null}

      {open ? (
        <div
          id={menuId}
          className="os-profile-menu-panel"
          role="menu"
          aria-label="Account menu"
        >
          <p className="os-profile-menu-email">{email}</p>

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

            <a
              href={supportMailto({ subject: "Help", path: pathname })}
              role="menuitem"
              className="os-profile-menu-link"
              onClick={() => setOpen(false)}
            >
              <span>Get help</span>
              <span className="os-profile-menu-hint">{supportEmail}</span>
            </a>
          </div>

          <div className="os-profile-menu-footer">
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
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="os-sidebar-avatar" aria-hidden>
          {initials(session.user.name, session.user.email)}
        </span>
        <span className="os-sidebar-user-meta">
          <span className="os-sidebar-user-name">{name}</span>
          <span className="os-sidebar-user-plan">{planLabel}</span>
        </span>
        <span className="os-profile-menu-chevron" aria-hidden>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden>
            <path
              d={open ? "M1 5l4-4 4 4" : "M1 1l4 4 4-4"}
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
    </div>
  );
}
