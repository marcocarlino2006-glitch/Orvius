import { osCurrentRing, osRings } from "@/lib/company";

export type OsNavItem = {
  href: string;
  label: string;
  ring?: number;
  badge?: string;
};

export const osProductNav: OsNavItem[] = [
  { href: "/dashboard", label: "Overview", ring: 1 },
  { href: "/dashboard/inbox", label: "Inbox", ring: 1, badge: "Live" },
  { href: "/dashboard/calls", label: "Calls", ring: 1 },
  { href: "/dashboard/customers", label: "Customers", ring: 2 },
  { href: "/dashboard/jobs", label: "Jobs", ring: 3 },
  { href: "/dashboard/dispatch", label: "Dispatch", ring: 4 },
  { href: "/dashboard/ask", label: "Ask" },
];

export const osWorkspaceNav: OsNavItem[] = [
  { href: "/admin", label: "Setup" },
  { href: "/demo", label: "Live demo" },
  { href: "/", label: "orvius.im" },
];

export function getOsRingMeta(ring: number) {
  return osRings.find((item) => item.ring === ring);
}

export { osCurrentRing, osRings };
