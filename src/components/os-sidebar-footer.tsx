"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { pricing } from "@/lib/company";
import { supportEmail, supportMailto } from "@/lib/support";
import { fetchAccount, invalidateAccount } from "@/lib/account-client";
import { ROLE_LABELS, type ShopRole, type ShopSummary } from "@/lib/workspace-access-labels";

type AccountData = {
  business: {
    name: string;
    billingStatus: string;
    billingPlan: string | null;
    ownerEmail?: string | null;
    trade?: string | null;
    environment?: string | null;
    id?: string;
  } | null;
  role?: ShopRole | null;
  shops?: ShopSummary[];
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
  attention?: boolean;
};

const accountLinks: MenuItem[] = [
  { href: "/dashboard?settings=account", label: "Account", hint: "Profile, plan, sign-in" },
  { href: "/dashboard?settings=business", label: "Settings", hint: "Business, line, hours, alerts" },
  { href: "/dashboard?settings=integrations", label: "Integrations", hint: "Phone, SMS, email, Stripe" },
  { href: "/dashboard?settings=billing", label: "Billing", hint: "Plan and invoices" },
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
  const [switching, setSwitching] = useState<string | null>(null);
  const [shopQuery, setShopQuery] = useState("");
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
  const role = account?.role ? ROLE_LABELS[account.role] : null;
  const currentId = account?.business?.id ?? null;
  const otherShops = (account?.shops ?? []).filter((shop) => shop.id !== currentId);
  const needle = shopQuery.trim().toLowerCase();
  const shownShops = needle ? otherShops.filter((shop) => shop.name.toLowerCase().includes(needle)) : otherShops;

  async function openShop(id: string) {
    setSwitching(id);
    const res = await fetch("/api/shop/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: id }),
    }).catch(() => null);
    if (res?.ok) {
      invalidateAccount();
      window.location.assign("/dashboard");
      return;
    }
    setSwitching(null);
  }
  const showPay = needsPayCta(account);
  const payLabel =
    (account?.billing?.status ?? "").toLowerCase() === "past_due"
      ? "Fix payment"
      : "Pay with card";
  const environment = account?.business?.environment ?? "production";
  const sampleWorkspace = environment === "demo" || environment === "test";
  const links = accountLinks.map((item) =>
    item.label === "Billing" && showPay
      ? { ...item, hint: payLabel, attention: true }
      : item,
  );

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
          className="os-profile-menu-panel"
          role="menu"
          aria-label="Account menu"
        >
          <div className="pm-identity">
            <span className="os-sidebar-avatar pm-avatar" aria-hidden>
              {initials(session.user.name, session.user.email)}
            </span>
            <div className="pm-identity-copy">
              <p className="pm-name">{name}</p>
              <p className="pm-email">{email}</p>
            </div>
            {role ? <span className="pm-role">{role}</span> : null}
          </div>

          <div className="pm-section">
            <p className="pm-section-label">Workspace</p>
            <div className="pm-workspace is-current" aria-current="true">
              <span className="pm-ws-mark" aria-hidden>
                {(account?.business?.name ?? "O").slice(0, 1).toUpperCase()}
              </span>
              <span className="pm-ws-copy">
                <span className="pm-ws-name">{account?.business?.name ?? "Your business"}</span>
                <span className="pm-ws-meta">
                  {[account?.business?.trade, planLabel].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="pm-ws-check" aria-hidden>✓</span>
            </div>
            {otherShops.length > 6 ? (
              <input
                className="pm-ws-filter"
                type="search"
                aria-label="Find a location"
                placeholder={`Find one of ${otherShops.length + 1} locations`}
                value={shopQuery}
                onChange={(e) => setShopQuery(e.target.value)}
              />
            ) : null}
            <div className="pm-ws-list">
            {shownShops.map((shop) => (
              <button
                key={shop.id}
                type="button"
                role="menuitem"
                className="pm-workspace"
                disabled={switching !== null}
                onClick={() => void openShop(shop.id)}
              >
                <span className="pm-ws-mark" aria-hidden>
                  {shop.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="pm-ws-copy">
                  <span className="pm-ws-name">{shop.name}</span>
                  <span className="pm-ws-meta">
                    {switching === shop.id ? "Opening…" : [shop.trade, ROLE_LABELS[shop.role]].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            ))}
            {needle && !shownShops.length ? <p className="pm-ws-note">No location matches.</p> : null}
            </div>
            {otherShops.length ? null : <p className="pm-ws-note">This sign-in has one workspace.</p>}
          </div>

          <div className="os-profile-menu-links pm-section">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={`os-profile-menu-link${item.attention ? " is-attention" : ""}`}
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
              <span>Help</span>
              <span className="os-profile-menu-hint">{supportEmail}</span>
            </a>
          </div>

          <div className="os-profile-menu-footer">
            <button
              type="button"
              role="menuitem"
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
          <svg viewBox="0 0 12 12" aria-hidden>
            <path d={open ? "M3 7.5L6 4.5l3 3" : "M3 4.5l3 3 3-3"} stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </button>
    </div>
  );
}
