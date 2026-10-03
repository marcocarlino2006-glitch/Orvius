"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { company, pricing } from "@/lib/company";
import { personInitials } from "@/components/record-avatar";
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
    plans?: Array<{ id: string; name: string; price: number }>;
    usage?: { used: number; included: number } | null;
    configured?: boolean;
    entitled?: boolean;
  };
};

const ICONS = {
  sparkles:
    "M9.94 15.5a2 2 0 0 0-1.44-1.44l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01",
  chevron: "m9 18 6-6-6-6",
  back: "m15 18-6-6 6-6",
  knowledge: "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4",
  account: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  settings: "M20 7h-9M14 17H5M17 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM7 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  home: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01",
  external: "M7 7h10v10M7 17 17 7",
  signout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  switch: "m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16",
} as const;

function Icon({ name, className = "pm-icon" }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
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

/** The black pill on the plan card: pay when unpaid, upgrade while a bigger plan exists, else manage. */
function planAction(account: AccountData | null): string {
  if ((account?.billing?.status ?? "").toLowerCase() === "past_due") return "Fix payment";
  if (needsPayCta(account)) return "Upgrade";
  const price = account?.billing?.plan?.price ?? 0;
  return (account?.billing?.plans ?? []).some((p) => p.price > price) ? "Upgrade" : "Manage";
}

export function OsSidebarFooter() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "locations">("menu");
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
    if (!open) {
      setView("menu");
      return;
    }

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
      clearWorkspaceSessionState();
      window.location.assign("/dashboard");
      return;
    }
    setSwitching(null);
  }

  const close = () => setOpen(false);
  const hasPlan = planLabel !== "No plan" && planLabel !== "Canceled";
  const planTitle = hasPlan ? `${company.productName} ${planLabel}` : planLabel;
  const usage = account?.billing?.usage ?? null;
  const environment = account?.business?.environment ?? "production";
  const sampleWorkspace = environment === "demo" || environment === "test";
  const initials = personInitials(session.user.name, session.user.email);

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
        <div id={menuId} className="os-profile-menu-panel pm-panel" role="menu" aria-label="Account menu">
          {view === "locations" ? (
            <div className="pm-locations">
              <button type="button" className="pm-back" onClick={() => setView("menu")}>
                <Icon name="back" />
                <span>Locations</span>
              </button>
              <div className="pm-workspace is-current" aria-current="true">
                <span className="pm-ws-mark" aria-hidden>
                  {(account?.business?.name ?? "O").slice(0, 1).toUpperCase()}
                </span>
                <span className="pm-ws-copy">
                  <span className="pm-ws-name">{account?.business?.name ?? "Your business"}</span>
                  <span className="pm-ws-meta">{[account?.business?.trade, role].filter(Boolean).join(" · ")}</span>
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
              {otherShops.length ? (
                <Link href="/dashboard/portfolio" role="menuitem" className="pm-ws-all" onClick={close}>
                  All {otherShops.length + 1} locations side by side
                </Link>
              ) : (
                <p className="pm-ws-note">This sign-in has one workspace.</p>
              )}
            </div>
          ) : (
            <>
              <div className="pm-head">
                <span className="pm-head-id" title={email ? `${name} · ${email}` : name}>
                  <span className="os-sidebar-avatar pm-head-avatar" aria-hidden>
                    {initials}
                  </span>
                  <span className="pm-head-badge" aria-hidden>
                    <Icon name="sparkles" className="pm-icon-xs" />
                  </span>
                  <span className="sr-only">
                    {name}
                    {email ? `, ${email}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="pm-switch"
                  aria-label="Switch location"
                  title="Switch location"
                  onClick={() => setView("locations")}
                >
                  <Icon name="switch" />
                </button>
              </div>

              <div className="pm-plan">
                <div className="pm-plan-top">
                  <span className="pm-plan-name">{planTitle}</span>
                  <Link href="/dashboard?settings=billing" role="menuitem" className="pm-plan-cta" onClick={close}>
                    {planAction(account)}
                  </Link>
                </div>
                <Link href="/dashboard?settings=billing" role="menuitem" className="pm-plan-row" onClick={close}>
                  <Icon name="sparkles" />
                  <span>Calls</span>
                  <span className="pm-plan-info" title="Calls answered this month, out of what your plan includes">
                    <Icon name="info" className="pm-icon-sm" />
                  </span>
                  <span className="pm-plan-value">
                    {usage ? `${usage.used.toLocaleString("en-US")} / ${usage.included.toLocaleString("en-US")}` : null}
                  </span>
                  <Icon name="chevron" className="pm-icon-sm" />
                </Link>
                <Link href="/pricing" role="menuitem" className="pm-plan-explore" onClick={close}>
                  <span>{hasPlan ? `Explore what's in ${planTitle}` : `Explore ${company.productName} plans`}</span>
                  <Icon name="chevron" className="pm-icon-sm" />
                </Link>
              </div>

              <div className="pm-group">
                <Link href="/dashboard?settings=receptionist" role="menuitem" className="pm-item" onClick={close}>
                  <Icon name="knowledge" />
                  <span>Knowledge</span>
                </Link>
              </div>
              <div className="pm-group">
                <Link href="/dashboard?settings=account" role="menuitem" className="pm-item" onClick={close}>
                  <Icon name="account" />
                  <span>Account</span>
                </Link>
                <Link href="/dashboard?settings=business" role="menuitem" className="pm-item" onClick={close}>
                  <Icon name="settings" />
                  <span>Settings</span>
                </Link>
              </div>
              <div className="pm-group">
                <a href="/" target="_blank" rel="noreferrer" role="menuitem" className="pm-item" onClick={close}>
                  <Icon name="home" />
                  <span>Homepage</span>
                  <Icon name="external" className="pm-icon-sm pm-item-end" />
                </a>
                <a href="/help" target="_blank" rel="noreferrer" role="menuitem" className="pm-item" onClick={close}>
                  <Icon name="help" />
                  <span>Get help</span>
                  <Icon name="external" className="pm-icon-sm pm-item-end" />
                </a>
              </div>
              <div className="pm-group">
                <button type="button" role="menuitem" className="pm-item pm-signout" onClick={() => signOut({ callbackUrl: "/" })}>
                  <Icon name="signout" />
                  <span>Sign out</span>
                </button>
              </div>
            </>
          )}
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
          {initials}
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

/** Per-tab state that belongs to the shop being left: its setup verdict and "since you looked" anchor. */
function clearWorkspaceSessionState() {
  try {
    for (const key of ["orvius:workspace-ready", "orvius.command.since"]) sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
