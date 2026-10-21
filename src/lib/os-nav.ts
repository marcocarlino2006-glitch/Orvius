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
 * bill get finished. Calls, Reports, Work and Ask stay reachable in search.
 */
export const osProductNav: OsNavItem[] = [
  { href: "/dashboard", label: "Home", icon: "command" },
  { href: "/dashboard/schedule", label: "Schedule", icon: "dispatch" },
  { href: "/dashboard/inbox", label: "Inbox", icon: "inbox" },
  { href: "/dashboard/customers", label: "Customers", icon: "customers" },
  { href: "/dashboard/jobs", label: "Jobs", icon: "jobs" },
];

/** Real screens that are not in the bar. Search opens them. */
export const osMoreNav: OsNavItem[] = [
  { href: "/dashboard/calls", label: "Calls", icon: "calls" },
  { href: "/dashboard/reports", label: "Reports", icon: "billing" },
  { href: "/dashboard/work", label: "Work", icon: "jobs" },
  { href: "/dashboard/ask", label: "Ask", icon: "ask" },
];

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
