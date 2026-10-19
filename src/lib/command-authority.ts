import { prisma } from "@/lib/prisma";
import { COPILOT_ACTIONS, type CopilotActionName } from "@/lib/copilot-propose";
import type { ShopRole } from "@/lib/workspace-access-labels";

/*
  Who may propose, approve, withdraw or resolve a Command plan. Independent of
  workspace role, autopilot and ordinary dispatch access: the owner holds every
  Command right; anyone else holds only what an owner explicitly granted, for
  one kind of plan, until it expires. Grants are rechecked when a plan runs.
*/

/** Bumped when these rules change; a grant issued under an older version no longer counts. */
export const COMMAND_POLICY_VERSION = "command-authority-1";

/** What each plan does in the world. "high" reaches a customer or the calendar they were promised. */
export const COMMAND_ACTION_EFFECT: Record<CopilotActionName, { risk: "low" | "high"; effect: string; touches: string[] }> = {
  assign_tech: { risk: "low", effect: "puts a technician on a job and texts them", touches: ["dispatch"] },
  mark_contacted: { risk: "low", effect: "marks a lead as contacted", touches: ["records"] },
  sms_followup: { risk: "high", effect: "texts a customer and marks them contacted", touches: ["customer_message"] },
  book_window: { risk: "high", effect: "books a customer into a time and texts them to confirm", touches: ["schedule", "customer_message"] },
  reschedule: { risk: "high", effect: "moves a customer's appointment and texts them the new time", touches: ["schedule", "customer_message"] },
};

/** Rights outside Command plans that an owner may still grant one person, on the same terms. */
export const EXTRA_GRANTS = {
  schedule_override: { risk: "high", effect: "books or moves work over a schedule conflict, with a reason on record", touches: ["schedule"] },
} as const satisfies Record<string, { risk: "low" | "high"; effect: string; touches: string[] }>;

export type GrantableAction = CopilotActionName | keyof typeof EXTRA_GRANTS;

export function grantEffect(action: GrantableAction): { risk: "low" | "high"; effect: string; touches: readonly string[] } {
  return action in EXTRA_GRANTS ? EXTRA_GRANTS[action as keyof typeof EXTRA_GRANTS] : COMMAND_ACTION_EFFECT[action as CopilotActionName];
}

/** Never approvable through a grant, whatever a future plan type is called. */
export const NEVER_GRANTABLE = [
  "money", "price", "invoice", "payment", "refund",
  "settings", "ai_policy", "integrations", "phone",
  "team", "access", "deletion",
] as const;

export type CommandGrantConditions = { allowSelfExecution?: boolean };

type GrantRow = {
  id: string;
  granteeEmail: string;
  action: string;
  conditionsJson: string;
  expiresAt: Date;
  policyVersion: string;
  revokedAt: Date | null;
};

type Actor = { role: ShopRole | string; email: string };

const norm = (email: string | null | undefined) => (email ?? "").trim().toLowerCase();

export function grantableAction(action: string): action is GrantableAction {
  if (!(COPILOT_ACTIONS as readonly string[]).includes(action) && !(action in EXTRA_GRANTS)) return false;
  const touches = grantEffect(action as GrantableAction).touches;
  return !touches.some((t) => (NEVER_GRANTABLE as readonly string[]).includes(t));
}

function isPlanAction(action: string): action is CopilotActionName {
  return (COPILOT_ACTIONS as readonly string[]).includes(action);
}

function conditions(grant: GrantRow): CommandGrantConditions {
  try {
    return JSON.parse(grant.conditionsJson) as CommandGrantConditions;
  } catch {
    return {};
  }
}

export function activeGrantsFor(grants: GrantRow[], actor: Actor, action: string, now = new Date()) {
  return grants.filter(
    (g) =>
      norm(g.granteeEmail) === norm(actor.email) &&
      g.action === action &&
      !g.revokedAt &&
      g.expiresAt.getTime() > now.getTime() &&
      g.policyVersion === COMMAND_POLICY_VERSION,
  );
}

export type ApprovalDecision =
  | { ok: true; kind: "owner_approval" | "owner_confirmation" | "grant" | "grant_self"; grantId: string | null }
  | { ok: false; error: string };

/**
 * May this person run this plan now? An owner confirming a plan they asked for
 * themselves is labelled owner_confirmation: one person decided, and the
 * record says so rather than implying a second check.
 */
export function decideApproval(params: {
  actor: Actor;
  proposal: { action: string; proposedByEmail: string | null };
  grants: GrantRow[];
  now?: Date;
}): ApprovalDecision {
  const { actor, proposal } = params;
  const own = Boolean(proposal.proposedByEmail) && norm(proposal.proposedByEmail) === norm(actor.email);
  if (actor.role === "owner") return { ok: true, kind: own ? "owner_confirmation" : "owner_approval", grantId: null };
  if (!isPlanAction(proposal.action) || !grantableAction(proposal.action)) return { ok: false, error: "Only the owner can approve this kind of plan." };
  const grant = activeGrantsFor(params.grants, actor, proposal.action, params.now)[0];
  if (!grant) return { ok: false, error: "You need a Command grant from the owner to approve this kind of plan." };
  if (!own) return { ok: true, kind: "grant", grantId: grant.id };
  const risk = COMMAND_ACTION_EFFECT[proposal.action as CopilotActionName].risk;
  if (risk === "high") return { ok: false, error: "This plan reaches a customer, so someone other than the person who asked for it has to approve it." };
  if (!conditions(grant).allowSelfExecution) return { ok: false, error: "Your grant doesn't let you approve plans you asked for yourself." };
  return { ok: true, kind: "grant_self", grantId: grant.id };
}

/** Owners and managers may ask for routine plans; anyone else needs a grant for that kind of plan. */
export function mayPropose(actor: Actor, action: string, grants: GrantRow[], now = new Date()): boolean {
  if (actor.role === "owner") return true;
  if (!isPlanAction(action)) return false;
  if (actor.role === "manager") return grantableAction(action);
  return activeGrantsFor(grants, actor, action, now).length > 0;
}

/** Withdrawing a pending plan: the owner, whoever asked for it, or a grant holder for that kind of plan. */
export function mayWithdraw(actor: Actor, proposal: { action: string; proposedByEmail: string | null }, grants: GrantRow[], now = new Date()): boolean {
  if (actor.role === "owner") return true;
  if (proposal.proposedByEmail && norm(proposal.proposedByEmail) === norm(actor.email)) return true;
  return activeGrantsFor(grants, actor, proposal.action, now).length > 0;
}

/** Marking an interrupted plan done or not done: the owner, or a grant holder for that kind of plan. */
export function mayResolve(actor: Actor, action: string, grants: GrantRow[], now = new Date()): boolean {
  if (actor.role === "owner") return true;
  return activeGrantsFor(grants, actor, action, now).length > 0;
}

export async function grantsForActor(businessId: string, email: string): Promise<GrantRow[]> {
  if (!email) return [];
  return prisma.commandGrant.findMany({
    where: { businessId, granteeEmail: norm(email), revokedAt: null },
    select: { id: true, granteeEmail: true, action: true, conditionsJson: true, expiresAt: true, policyVersion: true, revokedAt: true },
  });
}
