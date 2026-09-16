"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { OsIcon, type OsIconName } from "@/components/os-icons";
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
  };
};

type MenuItem = {
  href: string;
  label: string;
  icon: OsIconName;
  hint?: string;
};

/*
  Two links, and the corner holds nothing else. Billing lives on Settings,
  which is the single setup hub, rather than being a third row here and a
  fourth copy of itself in the sidebar.
*/
const accountLinks: MenuItem[] = [
  {
    href: "/dashboard/profile",
    label: "Profile",
    icon: "profile",
    hint: "You and your shop",
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: "settings",
    hint: "Line, alerts and plan",
  },
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

export function OsSidebarFooter() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<AccountData | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
      const panel = rootRef.current?.querySelector<HTMLElement>('[role="menu"]');
      const items = panel
        ? Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        : [];
      const current = items.indexOf(document.activeElement as HTMLElement);

      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (event.key === "Tab") {
        setOpen(false);
      } else if (event.key === "ArrowDown" && items.length) {
        event.preventDefault();
        items[(current + 1 + items.length) % items.length]?.focus();
      } else if (event.key === "ArrowUp" && items.length) {
        event.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
      } else if (event.key === "Home" && items.length) {
        event.preventDefault();
        items[0]?.focus();
      } else if (event.key === "End" && items.length) {
        event.preventDefault();
        items[items.length - 1]?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!session?.user) return null;

  const name = session.user.name ?? "User";
  const email = session.user.email ?? "";
  const planLabel = planDisplayLabel(account);

  return (
    <div
      ref={rootRef}
      className={`os-profile-menu os-sidebar-footer font-sans ${open ? "os-profile-menu-open" : ""}`}
    >
      {open ? (
        <div
          id={menuId}
          className="os-profile-menu-panel"
          role="menu"
          aria-label="Account menu"
        >
          <div className="os-profile-menu-account">
            <span className="os-profile-menu-account-avatar" aria-hidden>
              {initials(session.user.name, session.user.email)}
            </span>
            <span className="os-profile-menu-account-copy">
              <span className="os-profile-menu-account-name">{name}</span>
              <span className="os-profile-menu-email">{email}</span>
            </span>
            <span className="os-profile-menu-plan">{planLabel}</span>
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
                <OsIcon name={item.icon} />
                <span className="os-profile-menu-link-copy">
                  <span>{item.label}</span>
                  {item.hint ? (
                    <span className="os-profile-menu-hint">{item.hint}</span>
                  ) : null}
                </span>
              </Link>
            ))}

            {/*
              The only way to reach a person from inside the product. It used to
              be a mailto in the marketing footer and a line in a Legal panel on
              the billing page — findable by someone browsing the site, and not
              by the owner at 3am with a shop to run, which is the only person
              who ever needs it.

              An <a> rather than a Link because it leaves the app, and it
              arrives carrying the screen they were on.
            */}
            <a
              href={supportMailto({ subject: "Help", path: pathname })}
              role="menuitem"
              className="os-profile-menu-link"
              onClick={() => setOpen(false)}
            >
              <svg
                className="os-profile-menu-icon"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M9.8 9a2.35 2.35 0 1 1 3.35 2.12c-.85.42-1.15.96-1.15 1.88" />
                <path d="M12 16.7h.01" />
              </svg>
              <span className="os-profile-menu-link-copy">
                <span>Help and support</span>
                <span className="os-profile-menu-hint">{supportEmail}</span>
              </span>
            </a>
          </div>

          <div className="os-profile-menu-footer">
            <button
              type="button"
              className="os-profile-menu-signout"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              <svg
                className="os-profile-menu-icon"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <path d="M14 8V5.5A1.5 1.5 0 0 0 12.5 4h-7A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20h7a1.5 1.5 0 0 0 1.5-1.5V16" />
                <path d="M10 12h10M17 9l3 3-3 3" />
              </svg>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        ref={triggerRef}
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
          <svg viewBox="0 0 12 12" fill="none">
            <path d="m3 4.5 3 3 3-3" />
          </svg>
        </span>
      </button>
    </div>
  );
}
