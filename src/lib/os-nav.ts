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
 * Five doors. Command is where the owner directs Orvius and sees what needs
 * them; Work is the one queue every request and job flows through (Inbox and
 * Jobs are views of it, not separate sections); Schedule is the day; Calls
 * is the proof; Customers is the book. Everything else — Inbox, Jobs, Team,
 * Ask, Reports, Price book — stays one Search away and keeps its URL, but
 * no longer competes for the owner's attention in the nav.
 */
export const osProductNav: OsNavItem[] = [
  { href: "/dashboard", label: "Command", icon: "command", ring: 1 },
  { href: "/dashboard/work", label: "Work", icon: "jobs", ring: 1 },
  { href: "/dashboard/schedule", label: "Schedule", icon: "dispatch", ring: 1 },
  { href: "/dashboard/calls", label: "Calls", icon: "calls", ring: 1 },
  { href: "/dashboard/customers", label: "Customers", icon: "customers", ring: 1 },
];

/** Screens that belong to a nav item without living under its path. */
export const OS_NAV_ALIASES: Record<string, string[]> = {
  "/dashboard": ["/dashboard/ask"],
  "/dashboard/work": ["/dashboard/inbox", "/dashboard/jobs", "/dashboard/price-book"],
};

/** Reachable from Search and in-page links; deliberately not primary nav. */
export const osWorkspaceNav: OsNavItem[] = [
  { href: "/dashboard/inbox", label: "Inbox", icon: "inbox" },
  { href: "/dashboard/jobs", label: "Jobs", icon: "jobs" },
  { href: "/dashboard/team", label: "Team", icon: "profile" },
  { href: "/dashboard/ask", label: "Ask Orvius", icon: "ask" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  { href: "/dashboard/price-book", label: "Price book", icon: "billing" },
  { href: "/dashboard/profile", label: "Profile", icon: "profile" },
  { href: "/dashboard/reports", label: "Reports", icon: "billing" },
  { href: "/dashboard/billing", label: "Billing", icon: "billing" },
];

export function getOsRingMeta(ring: number) {
  return osRings.find((item) => item.ring === ring);
}

export { osCurrentRing, osRings };
