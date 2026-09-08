import { osCurrentRing, osRings } from "@/lib/company";
import type { OsIconName } from "@/components/os-icons";

export type OsNavItem = {
  href: string;
  label: string;
  icon: OsIconName;
  ring?: number;
  badge?: string;
};

export const osProductNav: OsNavItem[] = [
  { href: "/dashboard", label: "Command", icon: "command", ring: 1 },
  { href: "/dashboard/inbox", label: "Inbox", icon: "inbox", ring: 1 },
  { href: "/dashboard/calls", label: "Calls", icon: "calls", ring: 1 },
  { href: "/dashboard/customers", label: "Customers", icon: "customers", ring: 2 },
  { href: "/dashboard/jobs", label: "Jobs", icon: "jobs", ring: 3 },
  { href: "/dashboard/dispatch", label: "Dispatch", icon: "dispatch", ring: 4 },
  { href: "/dashboard/ask", label: "Copilot", icon: "copilot" },
];

export const osWorkspaceNav: OsNavItem[] = [
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  { href: "/dashboard/profile", label: "Profile", icon: "profile" },
  { href: "/dashboard/billing", label: "Billing", icon: "billing" },
];

export function getOsRingMeta(ring: number) {
  return osRings.find((item) => item.ring === ring);
}

export { osCurrentRing, osRings };
