"use client";

import Link from "next/link";
import { toast } from "@/components/toaster";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { pricing } from "@/lib/company";
import { supportMailto, supportPhone } from "@/lib/support";
import { fetchAccount, invalidateAccount } from "@/lib/account-client";
import { ROLE_LABELS, can, type ShopRole, type ShopSummary } from "@/lib/workspace-access-labels";

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
    pilotEndsAt?: string | null;
  };
};

type IconName =
  | "account"
  | "personalization"
  | "settings"
  | "home"
  | "help"
  | "docs"
  | "pricebook"
  | "external"
  | "signout"
  | "updown"
  | "sparkle"
  | "chevron"
  | "phone"
  | "bell"
  | "back"
  | "check"
  | "reports";

type MenuItem = {
  href: string;
  label: string;
  icon: IconName;
  mail?: boolean;
};

const accountLinks: MenuItem[] = [
  { href: "/dashboard?settings=account", label: "Account", icon: "account" },
  { href: "/dashboard?settings=receptionist", label: "Receptionist", icon: "personalization" },
  { href: "/dashboard/price-book", label: "Price book", icon: "pricebook" },
  { href: "/dashboard/reports", label: "Reports", icon: "reports" },
  { href: "/dashboard?settings=general", label: "Settings", icon: "settings" },
];

const moreLinks: MenuItem[] = [
  { href: "/", label: "Homepage", icon: "home" },
  { href: "help", label: "Get help", icon: "help", mail: true },
  { href: "/resources", label: "Docs", icon: "docs" },
];

const phone = supportPhone();

function mark(name: string | null | undefined) {
  const letter = name?.trim()?.[0];
  return letter ? letter.toUpperCase() : "O";
}

function billingStatusOf(account: AccountData | null) {
  return (account?.billing?.status ?? account?.business?.billingStatus ?? "none").toLowerCase();
}

function planDisplayLabel(account: AccountData | null): string {
  const status = billingStatusOf(account);
  if (status === "pilot") return `Orvius ${pricing.pilot.name}`;
  if (status === "active" || status === "past_due") {
    return account?.billing?.plan?.name ? `Orvius ${account.billing.plan.name}` : "Orvius";
  }
  if (status === "canceled") return "Canceled";
  return "Orvius Free";
}

function billingValue(account: AccountData | null): string {
  const status = billingStatusOf(account);
  if (status === "pilot") {
    const ends = account?.billing?.pilotEndsAt ? new Date(account.billing.pilotEndsAt) : null;
    return ends && !Number.isNaN(ends.getTime())
      ? `Ends ${ends.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : "Pilot";
  }
  if (status === "past_due") return "Past due";
  if (status === "active") {
    const price = account?.billing?.plan?.price;
    return price ? `$${price}/mo` : "Active";
  }
  return "See plans";
}

/** Per-tab state that belongs to the shop being left: its setup verdict and "since you looked" anchor. */
function clearWorkspaceSessionState() {
  try {
    for (const key of ["orvius:workspace-ready", "orvius.command.since"]) sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function OsSidebarFooter({ newLeads = 0 }: { newLeads?: number }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "locations">("menu");
  const [switching, setSwitching] = useState<string | null>(null);
  const [shopQuery, setShopQuery] = useState("");
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
  const role = account?.role ? ROLE_LABELS[account.role] : null;
  const currentId = account?.business?.id ?? null;
  const otherShops = (account?.shops ?? []).filter((shop) => shop.id !== currentId);
  const needle = shopQuery.trim().toLowerCase();
  const shownShops = needle ? otherShops.filter((shop) => shop.name.toLowerCase().includes(needle)) : otherShops;
  const environment = account?.business?.environment ?? "production";
  const sampleWorkspace = environment === "demo" || environment === "test";
  const upgradeLabel = billingStatusOf(account) === "past_due" ? "Fix payment" : "Upgrade";
  const close = () => setOpen(false);

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
    const data = (await res?.json().catch(() => null)) as { error?: string } | null;
    toast({ title: data?.error ?? "Couldn't switch shops. You're still in this one — try again.", tone: "error" });
    setSwitching(null);
  }

  return (
    <div ref={rootRef} className="os-sidebar-footer mx-footer font-sans">
      {sampleWorkspace ? (
        <p className="mx-env" role="status">
          {environment === "test" ? "Test workspace — not a real shop" : "Demo workspace — sample data"}
        </p>
      ) : null}

      {open ? (
        <div id={menuId} className="mx-menu" role="menu" aria-label="Account menu">
          {view === "locations" ? (
            <div className="mx-locations">
              <button type="button" className="mx-link mx-back" onClick={() => setView("menu")}>
                <MenuIcon name="back" />
                <span>Locations</span>
              </button>
              <div className="mx-ws is-current" aria-current="true">
                <span className="mx-ws-mark" aria-hidden>
                  {mark(account?.business?.name)}
                </span>
                <span className="mx-identity-copy">
                  <span className="mx-name">{account?.business?.name ?? "Your business"}</span>
                  <span className="mx-sub">{[account?.business?.trade, role].filter(Boolean).join(" · ")}</span>
                </span>
                <MenuIcon name="check" className="mx-ws-check" />
              </div>
              {otherShops.length > 6 ? (
                <input
                  className="mx-ws-filter"
                  type="search"
                  aria-label="Find a location"
                  placeholder={`Find one of ${otherShops.length + 1} locations`}
                  value={shopQuery}
                  onChange={(e) => setShopQuery(e.target.value)}
                />
              ) : null}
              <div className="mx-ws-list">
                {shownShops.map((shop) => (
                  <button
                    key={shop.id}
                    type="button"
                    role="menuitem"
                    className="mx-ws"
                    disabled={switching !== null}
                    onClick={() => void openShop(shop.id)}
                  >
                    <span className="mx-ws-mark" aria-hidden>
                      {mark(shop.name)}
                    </span>
                    <span className="mx-identity-copy">
                      <span className="mx-name">{shop.name}</span>
                      <span className="mx-sub">
                        {switching === shop.id ? "Opening…" : [shop.trade, ROLE_LABELS[shop.role]].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                ))}
                {needle && !shownShops.length ? <p className="mx-ws-note">No location matches.</p> : null}
              </div>
              {otherShops.length ? (
                <Link href="/dashboard/portfolio" role="menuitem" className="mx-ws-all" onClick={close}>
                  All {otherShops.length + 1} locations side by side
                </Link>
              ) : (
                <p className="mx-ws-note">This sign-in has one workspace.</p>
              )}
            </div>
          ) : (
          <>
          <button
            type="button"
            role="menuitem"
            className="pm-identity mx-identity"
            aria-label="Switch location"
            title="Switch location"
            onClick={() => setView("locations")}
          >
            <span className="mx-avatar" aria-hidden>
              {mark(session.user.name)}
            </span>
            <span className="mx-identity-copy">
              <span className="mx-name">{name}</span>
              <span className="mx-sub">{account?.business?.name ?? role ?? "Personal"}</span>
            </span>
            <MenuIcon name="updown" className="mx-updown" />
          </button>

          <div className="mx-plan">
            <div className="mx-plan-head">
              <span className="mx-plan-name">{planDisplayLabel(account)}</span>
              <Link href="/dashboard?settings=billing" role="menuitem" className="mx-upgrade" onClick={close}>
                {upgradeLabel}
              </Link>
            </div>
            <Link href="/dashboard?settings=billing" role="menuitem" className="mx-plan-row" onClick={close}>
              <MenuIcon name="sparkle" />
              <span>Billing</span>
              <span className="mx-plan-value">{billingValue(account)}</span>
              <MenuIcon name="chevron" className="mx-plan-chevron" />
            </Link>
          </div>

          <div className="mx-group">
            {accountLinks.filter((item) => item.href !== "/dashboard/reports" || !account?.role || can(account.role, "reports.view")).map((item) => (
              <Link key={item.label} href={item.href} role="menuitem" className="mx-link" onClick={close}>
                <MenuIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          <div className="mx-group mx-group--rule">
            {moreLinks.map((item) =>
              item.mail ? (
                <a
                  key={item.label}
                  href={supportMailto({ subject: "Help", path: pathname })}
                  role="menuitem"
                  className="mx-link"
                  onClick={close}
                >
                  <MenuIcon name={item.icon} />
                  <span>{item.label}</span>
                  <MenuIcon name="external" className="mx-trail" />
                </a>
              ) : (
                <Link key={item.label} href={item.href} role="menuitem" className="mx-link" onClick={close}>
                  <MenuIcon name={item.icon} />
                  <span>{item.label}</span>
                  <MenuIcon name="external" className="mx-trail" />
                </Link>
              ),
            )}
            {phone ? (
              <a href={`tel:${phone.tel}`} role="menuitem" className="mx-link" onClick={close}>
                <MenuIcon name="help" />
                <span>Call support · {phone.display}</span>
              </a>
            ) : null}
          </div>

          <div className="mx-group mx-group--rule">
            <button
              type="button"
              role="menuitem"
              className="mx-link mx-signout"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <MenuIcon name="signout" />
              <span>Sign out</span>
            </button>
          </div>
          </>
          )}
        </div>
      ) : null}

      <div className="mx-bar">
        <button
          type="button"
          className="mx-chip"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Account menu for ${name}`}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="mx-avatar" aria-hidden>
            {mark(session.user.name)}
          </span>
          <span className="mx-chip-name">{name}</span>
        </button>
        <Link href="/dashboard?settings=phone" className="mx-bar-icon" aria-label="Phone line settings">
          <MenuIcon name="phone" />
        </Link>
        <Link
          href="/dashboard/inbox"
          className="mx-bar-icon"
          aria-label={newLeads > 0 ? `Inbox, ${newLeads} new` : "Inbox"}
        >
          <MenuIcon name="bell" />
          {newLeads > 0 ? <span className="mx-dot" aria-hidden /> : null}
        </Link>
      </div>
    </div>
  );
}

const MENU_PATHS: Record<IconName, string[]> = {
  reports: ["M5 19.5V11M10 19.5V5M15 19.5v-6M20 19.5V8", "M3.5 19.5h17"],
  account: ["M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M5 20a7 7 0 0 1 14 0"],
  personalization: [
    "M4.5 5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3Z",
    "M4.5 15.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3Z",
    "M14.5 15.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3Z",
    "M17 4.5v5M14.5 7h5",
  ],
  settings: [
    "M4 7h9",
    "M19 7h1",
    "M16 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
    "M4 17h1",
    "M11 17h9",
    "M8 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  ],
  home: ["M4.5 10 12 4l7.5 6v9a1 1 0 0 1-1 1H15v-5.5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1V20H5.5a1 1 0 0 1-1-1v-9Z"],
  help: [
    "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z",
    "M9.7 9.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .8-1 1.4v.4",
    "M12 16.6v.1",
  ],
  docs: ["M6 5.5A1.5 1.5 0 0 1 7.5 4H18v14H7.5A1.5 1.5 0 0 0 6 19.5v-14Z", "M6 19.5A1.5 1.5 0 0 0 7.5 21H18v-3"],
  pricebook: ["M4.5 12.4V5.5a1 1 0 0 1 1-1h6.9l7.1 7.1-7.9 7.9-7.1-7.1Z", "M8.5 8.5h.01"],
  external: ["M7.5 16.5 16.5 7.5", "M9 7.5h7.5V15"],
  signout: ["M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14", "M10.5 12H20", "M16.5 8.5 20 12l-3.5 3.5"],
  updown: ["M8.5 9.5 12 6l3.5 3.5", "M8.5 14.5 12 18l3.5-3.5"],
  sparkle: [
    "M12 3.5c.5 3.8 2.7 6 6.5 6.5-3.8.5-6 2.7-6.5 6.5-.5-3.8-2.7-6-6.5-6.5 3.8-.5 6-2.7 6.5-6.5Z",
    "M18.5 15.5v4M16.5 17.5h4",
  ],
  chevron: ["M10 7.5 14.5 12 10 16.5"],
  back: ["M14 7.5 9.5 12l4.5 4.5"],
  check: ["m6.5 12.5 3.5 3.5 7.5-8"],
  phone: [
    "M8.2 4.5H6.3A1.8 1.8 0 0 0 4.5 6.4C4.9 13.8 10.2 19.1 17.6 19.5a1.8 1.8 0 0 0 1.9-1.8v-1.9a1 1 0 0 0-.7-1l-2.6-.9a1 1 0 0 0-1.1.3l-1 1.2a11 11 0 0 1-5.5-5.5l1.2-1a1 1 0 0 0 .3-1.1l-.9-2.6a1 1 0 0 0-1-.7Z",
  ],
  bell: [
    "M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5l1.5-2Z",
    "M10 20.5a2.2 2.2 0 0 0 4 0",
  ],
};

function MenuIcon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg className={`mx-icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" aria-hidden>
      {MENU_PATHS[name].map((d) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
