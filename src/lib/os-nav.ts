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
 * Command, then Work: every request and job in one list. The inbox and jobs
 * screens still hold each item's detail page, so Work stays lit on them.
 */
export const osProductNav: OsNavItem[] = [
  { href: "/dashboard", label: "Command", icon: "command", ring: 1 },
  { href: "/dashboard/work", label: "Work", icon: "jobs", ring: 1 },
  { href: "/dashboard/calls", label: "Calls", icon: "calls", ring: 1 },
  { href: "/dashboard/customers", label: "Customers", icon: "customers", ring: 2 },
  { href: "/dashboard/dispatch", label: "Dispatch", icon: "dispatch", ring: 4 },
  { href: "/dashboard/ask", label: "Ask", icon: "ask" },
];

/** Screens that belong to a nav item without living under its path. */
export const OS_NAV_ALIASES: Record<string, string[]> = {
  "/dashboard/work": ["/dashboard/inbox", "/dashboard/jobs", "/dashboard/price-book"],
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
