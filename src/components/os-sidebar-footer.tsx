"use client";

import { Libre_Baskerville } from "next/font/google";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { pricing } from "@/lib/company";
import { supportMailto } from "@/lib/support";
import { fetchAccount } from "@/lib/account-client";

const planSerif = Libre_Baskerville({
  weight: "700",
  subsets: ["latin"],
  variable: "--font-plan-serif",
  display: "swap",
  preload: false,
});

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
  | "external"
  | "signout"
  | "updown"
  | "sparkle"
  | "chevron"
  | "phone"
  | "bell";

type MenuItem = {
  href: string;
  label: string;
  icon: IconName;
  mail?: boolean;
};

const accountLinks: MenuItem[] = [
  { href: "/dashboard?settings=account", label: "Account", icon: "account" },
  { href: "/dashboard?settings=receptionist", label: "Receptionist", icon: "personalization" },
  { href: "/dashboard?settings=general", label: "Settings", icon: "settings" },
];

const moreLinks: MenuItem[] = [
  { href: "/", label: "Homepage", icon: "home" },
  { href: "help", label: "Get help", icon: "help", mail: true },
  { href: "/resources", label: "Docs", icon: "docs" },
];

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

function workspaceLabel(role: "Owner" | "Member" | null): string {
  return role === "Member" ? "Member" : "Personal";
}

export function OsSidebarFooter({ newLeads = 0 }: { newLeads?: number }) {
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
  const ownerEmail = account?.business?.ownerEmail?.toLowerCase() ?? null;
  const role: "Owner" | "Member" | null = !account
    ? null
    : ownerEmail && email.toLowerCase() === ownerEmail
      ? "Owner"
      : "Member";
  const environment = account?.business?.environment ?? "production";
  const sampleWorkspace = environment === "demo" || environment === "test";
  const upgradeLabel = billingStatusOf(account) === "past_due" ? "Fix payment" : "Upgrade";
  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="os-sidebar-footer mx-footer font-sans">
      {sampleWorkspace ? (
        <p className="mx-env" role="status">
          {environment === "test" ? "Test workspace — not a real shop" : "Demo workspace — sample data"}
        </p>
      ) : null}

      {open ? (
        <div id={menuId} className="mx-menu" role="menu" aria-label="Account menu">
          <Link
            href="/dashboard?settings=account"
            role="menuitem"
            className="pm-identity mx-identity"
            onClick={close}
          >
            <span className="mx-avatar" aria-hidden>
              {mark(session.user.name)}
            </span>
            <span className="mx-identity-copy">
              <span className="mx-name">{name}</span>
              <span className="mx-sub">{workspaceLabel(role)}</span>
            </span>
            <MenuIcon name="updown" className="mx-updown" />
          </Link>

          <div className="mx-plan">
            <div className="mx-plan-head">
              <span className={`mx-plan-name ${planSerif.variable}`}>{planDisplayLabel(account)}</span>
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
            {accountLinks.map((item) => (
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
  external: ["M7.5 16.5 16.5 7.5", "M9 7.5h7.5V15"],
  signout: ["M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14", "M10.5 12H20", "M16.5 8.5 20 12l-3.5 3.5"],
  updown: ["M8.5 9.5 12 6l3.5 3.5", "M8.5 14.5 12 18l3.5-3.5"],
  sparkle: [
    "M12 3.5c.5 3.8 2.7 6 6.5 6.5-3.8.5-6 2.7-6.5 6.5-.5-3.8-2.7-6-6.5-6.5 3.8-.5 6-2.7 6.5-6.5Z",
    "M18.5 15.5v4M16.5 17.5h4",
  ],
  chevron: ["M10 7.5 14.5 12 10 16.5"],
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
