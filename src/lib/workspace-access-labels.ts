/* Role names, rules and types, safe to import in the browser. */

export const ACTIVE_SHOP_COOKIE = "orvius_shop";

export type ShopRole = "owner" | "manager" | "dispatcher";

export const MEMBER_ROLES = ["manager", "dispatcher"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ROLE_LABELS: Record<ShopRole, string> = {
  owner: "Owner",
  manager: "Manager",
  dispatcher: "Dispatcher",
};

export const ROLE_DETAILS: Record<ShopRole, string> = {
  owner: "Everything, including billing and deleting the workspace.",
  manager: "Everything except billing and deleting the workspace.",
  dispatcher: "Calls, leads, jobs, customers and dispatch. Can't change settings or the team.",
};

export type Permission =
  | "settings.edit"
  | "team.manage"
  | "data.export"
  | "billing.manage"
  | "workspace.delete";

const GRANTS: Record<ShopRole, ReadonlySet<Permission>> = {
  owner: new Set(["settings.edit", "team.manage", "data.export", "billing.manage", "workspace.delete"]),
  manager: new Set(["settings.edit", "team.manage", "data.export"]),
  dispatcher: new Set(),
};

export function can(role: ShopRole, permission: Permission): boolean {
  return GRANTS[role].has(permission);
}

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === "string" && (MEMBER_ROLES as readonly string[]).includes(value);
}

export type ShopSummary = { id: string; name: string; role: ShopRole; trade: string | null };
