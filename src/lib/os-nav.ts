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
 * The owner lives on Command. Work, Schedule, Calls, Customers, Inbox, Jobs,
 * Ask and Reports are not places to go. A specific call, job or person still
 * opens. Search reaches the shop's rules.
 */
export const osProductNav: OsNavItem[] = [];

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
