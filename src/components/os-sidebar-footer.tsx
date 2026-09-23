"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { pricing } from "@/lib/company";
import { supportEmail, supportMailto } from "@/lib/support";
import { useBusiness } from "@/lib/use-business";
import { useOptionalRing1 } from "@/lib/ring1-context";

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

type ControlItem = {
  id: string;
  href: string;
  label: string;
  hint: string;
  section: "you" | "shop" | "systems";
  keywords?: string;
  external?: boolean;
  tone?: "default" | "risk";
};

/**
 * Owner command surface — person, shop, AI, team, money, security.
 * Destinations are real Orvius routes/anchors only (no theater pages).
 */
const CONTROLS: ControlItem[] = [
  {
    id: "profile",
    href: "/dashboard/profile",
    label: "Profile",
    hint: "Name, email, shop identity",
    section: "you",
    keywords: "account me user",
  },
  {
    id: "security",
    href: "/dashboard/profile",
    label: "Security & privacy",
    hint: "Sign-in and account access",
    section: "you",
    keywords: "password oauth google privacy",
  },
  {
    id: "shop-settings",
    href: "/dashboard/settings",
    label: "Shop settings",
    hint: "Capture, line, and baselines",
    section: "shop",
    keywords: "setup configure",
  },
  {
    id: "ai",
    href: "/dashboard/settings#ai-receptionist",
    label: "AI receptionist",
    hint: "Opening line and intake voice",
    section: "shop",
    keywords: "greeting assistant vapi voice",
  },
  {
    id: "phone",
    href: "/dashboard/settings#overflow-forward",
    label: "Phone & call rules",
    hint: "Line, forwarding, overflow",
    section: "shop",
    keywords: "twilio forward capture",
  },
  {
    id: "hours",
    href: "/dashboard/settings#overflow-forward",
    label: "Business hours",
    hint: "After-hours coverage rules",
    section: "shop",
    keywords: "schedule timezone night",
  },
  {
    id: "booking",
    href: "/dashboard/jobs",
    label: "Calendar & booking",
    hint: "Jobs, windows, confirmations",
    section: "shop",
    keywords: "appointments schedule",
  },
  {
    id: "area",
    href: "/dashboard/settings",
    label: "Service area",
    hint: "Where the shop takes work",
    section: "shop",
    keywords: "geo territory zip",
  },
  {
    id: "notifications",
    href: "/dashboard/settings#owner-alerts",
    label: "Notifications",
    hint: "Owner SMS and alert delivery",
    section: "shop",
    keywords: "sms alerts text",
  },
  {
    id: "team",
    href: "/dashboard/dispatch",
    label: "Team & permissions",
    hint: "Crew roster and assignment",
    section: "systems",
    keywords: "technicians tech people",
  },
  {
    id: "integrations",
    href: "/dashboard/billing#payouts",
    label: "Integrations",
    hint: "Payouts and connected money path",
    section: "systems",
    keywords: "stripe connect twilio",
  },
  {
    id: "billing",
    href: "/dashboard/billing",
    label: "Billing",
    hint: "Plan, card, and payouts",
    section: "systems",
    keywords: "pay subscription invoice",
  },
  {
    id: "audit",
    href: "/dashboard",
    label: "Audit log",
    hint: "Measured shift activity on Command",
    section: "systems",
    keywords: "history timeline proof",
  },
];

const SECTION_LABEL: Record<ControlItem["section"], string> = {
  you: "You",
  shop: "Shop & AI",
  systems: "Team, money & trust",
};

type SystemStatus = {
  id: "answering" | "attention" | "offline";
  label: string;
  href: string;
  detail: string;
};

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

function roleLabel(account: AccountData | null): string {
  const status = (
    account?.billing?.status ??
    account?.business?.billingStatus ??
    "none"
  ).toLowerCase();
  if (status === "pilot") return "Owner · Pilot";
  if (status === "active") return "Owner";
  if (status === "past_due") return "Owner · Payment due";
  return "Owner";
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

function resolveSystemStatus(input: {
  line: string | null | undefined;
  lineVerified: boolean;
  alertsFailed: number;
  attentionCount: number;
}): SystemStatus {
  if (!input.line) {
    return {
      id: "offline",
      label: "Offline",
      href: "/dashboard/settings#overflow-forward",
      detail: "No live line yet — activate capture",
    };
  }
  if (!input.lineVerified || input.alertsFailed > 0) {
    return {
      id: "attention",
      label: "Needs attention",
      href: input.alertsFailed > 0 ? "/dashboard#attention-board" : "/dashboard/settings#overflow-forward",
      detail:
        input.alertsFailed > 0
          ? `${input.alertsFailed} alert delivery issue${input.alertsFailed === 1 ? "" : "s"}`
          : "Line needs a prove-it call",
    };
  }
  if (input.attentionCount > 0) {
    return {
      id: "attention",
      label: "Needs attention",
      href: "/dashboard#attention-board",
      detail: `${input.attentionCount} item${input.attentionCount === 1 ? "" : "s"} on Command`,
    };
  }
  return {
    id: "answering",
    label: "Answering",
    href: "/dashboard",
    detail: "Live line covered",
  };
}

function matchesQuery(item: ControlItem, q: string) {
  if (!q) return true;
  const hay = `${item.label} ${item.hint} ${item.keywords ?? ""}`.toLowerCase();
  return hay.includes(q);
}

/**
 * Bottom-left identity control → upward command popover.
 * Orvius OS chrome for person, shop, AI, team, integrations, and security.
 */
export function OsSidebarFooter() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { business } = useBusiness();
  const ring = useOptionalRing1();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<AccountData | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([]);
  const menuId = useId();
  const searchId = useId();

  useEffect(() => {
    fetch("/api/account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setAccount(data);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  const status = resolveSystemStatus({
    line: business?.line,
    lineVerified: Boolean(business?.signals.lineVerified),
    alertsFailed: business?.signals.alertsFailed24h ?? 0,
    attentionCount: ring?.data?.attention?.length ?? 0,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CONTROLS.filter((item) => matchesQuery(item, q));
  }, [query]);

  const sections = useMemo(() => {
    const order: ControlItem["section"][] = ["you", "shop", "systems"];
    return order
      .map((section) => ({
        section,
        label: SECTION_LABEL[section],
        items: filtered.filter((item) => item.section === section),
      }))
      .filter((group) => group.items.length > 0);
  }, [filtered]);

  const flatActions = useMemo(() => {
    const list: Array<{ kind: "link"; item: ControlItem } | { kind: "help" } | { kind: "signout" }> =
      filtered.map((item) => ({ kind: "link" as const, item }));
    if (!query.trim() || "help support".includes(query.trim().toLowerCase()) || supportEmail.includes(query.trim().toLowerCase())) {
      list.push({ kind: "help" });
    }
    if (!query.trim() || "sign out logout".includes(query.trim().toLowerCase())) {
      list.push({ kind: "signout" });
    }
    return list;
  }, [filtered, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  function onPanelKeyDown(event: ReactKeyboardEvent) {
    if (!flatActions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatActions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && document.activeElement === searchRef.current) {
      event.preventDefault();
      itemRefs.current[activeIndex]?.click();
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(flatActions.length - 1);
    }
  }

  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  if (!session?.user) return null;

  const name = session.user.name ?? "Owner";
  const email = session.user.email ?? "";
  const shopName = account?.business?.name ?? business?.name ?? "Your shop";
  const planLabel = planDisplayLabel(account);
  const role = roleLabel(account);
  const showPay = needsPayCta(account);
  const payLabel =
    (account?.billing?.status ?? "").toLowerCase() === "past_due"
      ? "Fix payment"
      : "Pay with card";
  const modKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘"
    : "Ctrl";

  let actionCursor = -1;

  return (
    <div
      ref={rootRef}
      className={`os-identity os-sidebar-footer font-sans ${open ? "os-identity-open" : ""}`}
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
          className="os-identity-popover"
          role="dialog"
          aria-label="Owner control panel"
          aria-modal="false"
          onKeyDown={onPanelKeyDown}
        >
          <div className="os-identity-search">
            <label className="sr-only" htmlFor={searchId}>
              Search controls
            </label>
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              className="os-identity-search-input"
              placeholder="Search controls…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="os-identity-search-hint" aria-hidden>
              {modKey}K
            </span>
          </div>

          <Link
            href={status.href}
            className={`os-identity-status os-identity-status--${status.id}`}
            onClick={close}
          >
            <span className="os-identity-status-dot" aria-hidden />
            <span className="os-identity-status-copy">
              <strong>{status.label}</strong>
              <span>{status.detail}</span>
            </span>
            <span className="os-identity-status-go">Open →</span>
          </Link>

          <div className="os-identity-workspace">
            <p className="os-identity-kicker">Workspace</p>
            <p className="os-identity-workspace-name">{shopName}</p>
            <p className="os-identity-workspace-meta">
              {planLabel}
              {business?.line ? ` · ${business.line}` : ""}
            </p>
          </div>

          <div className="os-identity-scroll">
            {sections.length === 0 ? (
              <p className="os-identity-empty">No controls match “{query.trim()}”.</p>
            ) : (
              sections.map((group) => (
                <section key={group.section} className="os-identity-section">
                  <h3 className="os-identity-kicker">{group.label}</h3>
                  <ul className="os-identity-list">
                    {group.items.map((item) => {
                      actionCursor += 1;
                      const index = actionCursor;
                      return (
                        <li key={item.id}>
                          <Link
                            ref={(el) => {
                              itemRefs.current[index] = el;
                            }}
                            href={item.href}
                            className={`os-identity-item${
                              index === activeIndex ? " is-active" : ""
                            }`}
                            onClick={close}
                            onMouseEnter={() => setActiveIndex(index)}
                          >
                            <span className="os-identity-item-label">{item.label}</span>
                            <span className="os-identity-item-hint">{item.hint}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}

            <section className="os-identity-section os-identity-section--account">
              <h3 className="os-identity-kicker">Account</h3>
              <ul className="os-identity-list">
                {(() => {
                  const helpVisible = flatActions.some((a) => a.kind === "help");
                  if (!helpVisible) return null;
                  actionCursor += 1;
                  const index = actionCursor;
                  return (
                    <li>
                      <a
                        ref={(el) => {
                          itemRefs.current[index] = el;
                        }}
                        href={supportMailto({ subject: "Help", path: pathname })}
                        className={`os-identity-item${
                          index === activeIndex ? " is-active" : ""
                        }`}
                        onClick={close}
                        onMouseEnter={() => setActiveIndex(index)}
                      >
                        <span className="os-identity-item-label">Help</span>
                        <span className="os-identity-item-hint">{supportEmail}</span>
                      </a>
                    </li>
                  );
                })()}
                {(() => {
                  const outVisible = flatActions.some((a) => a.kind === "signout");
                  if (!outVisible) return null;
                  actionCursor += 1;
                  const index = actionCursor;
                  return (
                    <li>
                      <button
                        ref={(el) => {
                          itemRefs.current[index] = el;
                        }}
                        type="button"
                        className={`os-identity-item os-identity-signout${
                          index === activeIndex ? " is-active" : ""
                        }`}
                        onClick={() => signOut({ callbackUrl: "/" })}
                        onMouseEnter={() => setActiveIndex(index)}
                      >
                        <span className="os-identity-item-label">Sign out</span>
                        <span className="os-identity-item-hint">{email}</span>
                      </button>
                    </li>
                  );
                })()}
              </ul>
            </section>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="os-identity-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Owner controls for ${name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="os-sidebar-avatar" aria-hidden>
          {initials(session.user.name, session.user.email)}
        </span>
        <span className="os-identity-trigger-meta">
          <span className="os-identity-trigger-name">{name}</span>
          <span className="os-identity-trigger-sub">
            {role}
            <span aria-hidden> · </span>
            {shopName}
          </span>
          <span className={`os-identity-trigger-status os-identity-trigger-status--${status.id}`}>
            <span className="os-identity-status-dot" aria-hidden />
            {status.label}
          </span>
        </span>
        <span className="os-profile-menu-chevron" aria-hidden>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
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
