import { MEMBER_ROLES, ROLE_LABELS } from "@/lib/workspace-access-labels";

/**
 * The public description of who can sign in to a shop. Built from the role
 * list the permission checks use, so the claim cannot drift from the product.
 * Field techs get SMS job links, not workspace logins, and are not seats.
 */
export function workspaceAccessPublicClaim(): string {
  const roles = MEMBER_ROLES.map((r) => ROLE_LABELS[r].toLowerCase() + "s").join(" and ");
  return `Each shop has one owner, who can add ${roles} by email on every plan. Technicians get job links by text instead of logins.`;
}
