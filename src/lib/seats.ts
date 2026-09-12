/**
 * Workspace access — honest single-owner model (PERFECT-STANDARDS H12).
 * Do not invent multi-user seats, invites, or RBAC until shipped.
 */

export type WorkspaceSeatRole = "owner";

export type WorkspaceAccess = {
  model: "single-owner";
  /** Dashboard login seats beyond the signed-in owner. */
  inviteSeatsLive: boolean;
  /** Role labels that exist in product today. */
  rolesLive: readonly WorkspaceSeatRole[];
  /**
   * Field techs receive SMS job links / magic links — not workspace logins.
   * Crew rows on dispatch are not seat licenses.
   */
  fieldCrewIsNotSeat: true;
  summary: string;
  roadmapNote: string;
};

export const workspaceAccess: WorkspaceAccess = {
  model: "single-owner",
  inviteSeatsLive: false,
  rolesLive: ["owner"],
  fieldCrewIsNotSeat: true,
  summary:
    "One signed-in owner runs this shop workspace. Invite seats and per-role dashboards are not shipped.",
  roadmapNote:
    "Dispatcher and office seats come after the night-shift wedge is airtight on a live line. Until then, techs get SMS job links — not logins.",
};

export function workspaceAccessPublicClaim(): string {
  return workspaceAccess.summary;
}
