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
 * Command is where the owner directs Orvius; every other screen holds the
 * records it acts on. A request lives in Inbox until it becomes a job.
 */
export const osProductNav: OsNavItem[] = [
  { href: "/dashboard", label: "Command", icon: "command", ring: 1 },
  { href: "/dashboard/inbox", label: "Inbox", icon: "inbox", ring: 1 },
  { href: "/dashboard/calls", label: "Calls", icon: "calls", ring: 1 },
  { href: "/dashboard/jobs", label: "Jobs", icon: "jobs", ring: 1 },
  { href: "/dashboard/schedule", label: "Schedule", icon: "dispatch", ring: 1 },
  { href: "/dashboard/customers", label: "Customers", icon: "customers", ring: 1 },
  { href: "/dashboard/team", label: "Team", icon: "profile", ring: 1 },
];

/** Screens that belong to a nav item without living under its path. */
export const OS_NAV_ALIASES: Record<string, string[]> = {
  "/dashboard": ["/dashboard/work", "/dashboard/ask"],
  "/dashboard/jobs": ["/dashboard/price-book"],
};

export const osWorkspaceNav: OsNavItem[] = [
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  { href: "/dashboard/price-book", label: "Price book", icon: "billing" },
  { href: "/dashboard/profile", label: "Profile", icon: "profile" },
  { href: "/dashboard/billing", label: "Billing", icon: "billing" },
];

export function getOsRingMeta(ring: number) {
  return osRings.find((item) => item.ring === ring);
}

export { osCurrentRing, osRings };
