import { osCurrentRing, osRings } from "@/lib/company";
import type { OsIconName } from "@/components/os-icons";

export type OsNavItem = {
  href: string;
  label: string;
  icon: OsIconName;
  ring?: number;
  badge?: string;
};

/**
 * The places the owner runs. Home is the decision. Schedule, Inbox,
 * Customers and Jobs are where the day, the requests, the person and the
 * bill get finished. Calls, Work and Ask stay in search on a phone,
 * and that search sits at the bottom left. An iPad or a computer lists
 * every place down the left.
 * Money on Home opens the report.
 */
export const osProductNav: OsNavItem[] = [
  { href: "/dashboard", label: "Home", icon: "command" },
  { href: "/dashboard/schedule", label: "Schedule", icon: "dispatch" },
  { href: "/dashboard/inbox", label: "Inbox", icon: "inbox" },
  { href: "/dashboard/customers", label: "Customers", icon: "customers" },
  { href: "/dashboard/jobs", label: "Jobs", icon: "jobs" },
];

/** Real screens a phone reaches from the search at the bottom left. An iPad and a computer list them down the left. */
export const osMoreNav: OsNavItem[] = [
  { href: "/dashboard/calls", label: "Calls", icon: "calls" },
  { href: "/dashboard/work", label: "Work", icon: "jobs" },
  { href: "/dashboard/ask", label: "Ask", icon: "ask" },
];

const WIDE_ORDER = [
  "/dashboard",
  "/dashboard/schedule",
  "/dashboard/inbox",
  "/dashboard/calls",
  "/dashboard/customers",
  "/dashboard/jobs",
  "/dashboard/work",
  "/dashboard/ask",
];

/** Every place, in the order the left sidebar shows them. */
export const osWideNav: OsNavItem[] = WIDE_ORDER.map(
  (href) => [...osProductNav, ...osMoreNav].find((item) => item.href === href)!,
);

export function osNavCurrent(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Kept so older aliases have a home. Nothing in the shell paints them. */
export const OS_NAV_ALIASES: Record<string, string[]> = {};

/** The shop's rules. Not the day's work. */
export const osWorkspaceNav: OsNavItem[] = [
  { href: "/dashboard/team", label: "Team", icon: "profile" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  { href: "/dashboard/price-book", label: "Price book", icon: "billing" },
  { href: "/dashboard/profile", label: "Profile", icon: "profile" },
  { href: "/dashboard/billing", label: "Billing", icon: "billing" },
];

export function getOsRingMeta(ring: number) {
  return osRings.find((item) => item.ring === ring);
}

export { osCurrentRing, osRings };
