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
  };
};

type MenuItem = {
  href: string;
  label: string;
  hint?: string;
};

/*
  Two links, and the corner holds nothing else. Billing lives on Settings,
  which is the single setup hub, rather than being a third row here and a
  fourth copy of itself in the sidebar.
*/
const accountLinks: MenuItem[] = [
  { href: "/dashboard/profile", label: "Profile", hint: "You & your shop" },
  { href: "/dashboard/settings", label: "Settings", hint: "Line, alerts & plan" },
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
          {/*
            The button below already carries the avatar, the name and the
            plan, and the shop name is at the top of the sidebar. Repeating
            all four here made the popover look like a second account panel
            rather than a menu, so the header says only the one thing the
            button has no room for.
          */}
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
          {open ? "▴" : "▾"}
        </span>
      </button>
    </div>
  );
}
