import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { formatCentsExact } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/*
  Who may move money on a shop's behalf, checked at the moment of the action.
  The owner always may. Anyone else needs a FinancialGrant from the owner for
  that one kind of money action: still a member of the shop, not expired, not
  revoked, written under the current policy, and within its amount limit.
  Being a manager is not enough on its own.
*/

export const FINANCIAL_SCOPES = ["confirm_payment", "revise_bill", "price_book", "resolve_payment"] as const;
export type FinancialScope = (typeof FINANCIAL_SCOPES)[number];
/** Bumping this retires every grant written under the old wording. */
export const FINANCIAL_POLICY_VERSION = "money-grants-v1";
export const MAX_GRANT_DAYS = 90;

const SCOPE_TEXT: Record<FinancialScope, string> = {
  confirm_payment: "accept or turn down a customer's \"I paid\"",
  revise_bill: "change a bill the customer already has",
  price_book: "edit the price book",
  resolve_payment: "close a payment mismatch",
};

export type MoneyDecision =
  | { allowed: true; basis: "owner" }
  | { allowed: true; basis: "grant"; grantId: string }
  | { allowed: false; reason: string };

type Actor = { businessId: string; role: string; email: string };

export async function checkMoneyAuthority(actor: Actor, scope: FinancialScope, amountCents?: number | null, now = new Date()): Promise<MoneyDecision> {
  if (actor.role === "owner") return { allowed: true, basis: "owner" };
  const email = actor.email.trim().toLowerCase();
  const [member, grants] = await Promise.all([
    prisma.membership.findUnique({ where: { businessId_email: { businessId: actor.businessId, email } }, select: { id: true } }),
    prisma.financialGrant.findMany({
      where: { businessId: actor.businessId, granteeEmail: email, scope, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const ask = `Your role can't ${SCOPE_TEXT[scope]} without the owner's say-so. Ask the shop owner.`;
  if (!member) return { allowed: false, reason: ask };
  const current = grants.filter((g) => g.policyVersion === FINANCIAL_POLICY_VERSION);
  if (!current.length) return { allowed: false, reason: ask };
  const fits = current.find((g) => g.maxCents == null || amountCents == null || amountCents <= g.maxCents);
  if (!fits) {
    const cap = Math.max(...current.map((g) => g.maxCents ?? 0));
    return { allowed: false, reason: `That's over your ${formatCentsExact(cap)} limit to ${SCOPE_TEXT[scope]}. Ask the shop owner.` };
  }
  return { allowed: true, basis: "grant", grantId: fits.id };
}

/**
 * For routes: a 403 response when refused; otherwise the decision, and a grant
 * used on someone's behalf is written to the activity log with its id.
 */
export async function requireMoney(
  actor: Actor,
  scope: FinancialScope,
  context: { amountCents?: number | null; entityType: string; entityId: string; jobId?: string | null },
): Promise<{ error: NextResponse } | { decision: MoneyDecision & { allowed: true } }> {
  const decision = await checkMoneyAuthority(actor, scope, context.amountCents);
  if (!decision.allowed) return { error: NextResponse.json({ error: decision.reason, code: "money_authority" }, { status: 403 }) };
  if (decision.basis === "grant") {
    await recordAudit({
      businessId: actor.businessId,
      entityType: context.jobId ? "job" : "shop",
      entityId: context.jobId ?? actor.businessId,
      jobId: context.jobId ?? null,
      actor: "teammate",
      actorEmail: actor.email,
      action: "money.grant_used",
      summary: `Used the owner's grant to ${SCOPE_TEXT[scope]}`,
      detail: { grantId: decision.grantId, scope, amountCents: context.amountCents ?? null, target: { type: context.entityType, id: context.entityId }, policyVersion: FINANCIAL_POLICY_VERSION },
    });
  }
  return { decision };
}

export class FinancialGrantError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function grantMoneyAuthority(params: { businessId: string; ownerEmail: string; granteeEmail: string; scope: string; maxCents?: number | null; days: number; now?: Date }) {
  const now = params.now ?? new Date();
  const email = params.granteeEmail.trim().toLowerCase();
  if (!(FINANCIAL_SCOPES as readonly string[]).includes(params.scope)) throw new FinancialGrantError("Pick which money action to allow.");
  if (!Number.isInteger(params.days) || params.days < 1 || params.days > MAX_GRANT_DAYS) throw new FinancialGrantError(`A grant lasts 1 to ${MAX_GRANT_DAYS} days.`);
  if (params.maxCents != null && (!Number.isInteger(params.maxCents) || params.maxCents < 100)) throw new FinancialGrantError("The limit must be at least $1.");
  const member = await prisma.membership.findUnique({ where: { businessId_email: { businessId: params.businessId, email } }, select: { role: true } });
  if (!member) throw new FinancialGrantError("Only a current teammate can be given money authority.", 404);
  const grant = await prisma.financialGrant.create({
    data: {
      businessId: params.businessId,
      granteeEmail: email,
      scope: params.scope,
      maxCents: params.maxCents ?? null,
      expiresAt: new Date(now.getTime() + params.days * 86_400_000),
      policyVersion: FINANCIAL_POLICY_VERSION,
      grantedByEmail: params.ownerEmail.toLowerCase(),
    },
  });
  await recordAudit({
    businessId: params.businessId,
    entityType: "shop",
    entityId: params.businessId,
    actor: "owner",
    actorEmail: params.ownerEmail,
    action: "money.grant_created",
    summary: `${email} may ${SCOPE_TEXT[params.scope as FinancialScope]}${grant.maxCents ? ` up to ${formatCentsExact(grant.maxCents)}` : ""} until ${grant.expiresAt.toISOString().slice(0, 10)}`,
    detail: { grantId: grant.id, scope: grant.scope, maxCents: grant.maxCents, expiresAt: grant.expiresAt.toISOString(), policyVersion: grant.policyVersion },
  });
  return grant;
}

export async function revokeMoneyAuthority(params: { businessId: string; ownerEmail: string; grantId: string; now?: Date }) {
  const done = await prisma.financialGrant.updateMany({
    where: { id: params.grantId, businessId: params.businessId, revokedAt: null },
    data: { revokedAt: params.now ?? new Date(), revokedByEmail: params.ownerEmail.toLowerCase() },
  });
  if (!done.count) throw new FinancialGrantError("That grant is already revoked or isn't this shop's.", 404);
  await recordAudit({
    businessId: params.businessId,
    entityType: "shop",
    entityId: params.businessId,
    actor: "owner",
    actorEmail: params.ownerEmail,
    action: "money.grant_revoked",
    summary: "Money authority revoked",
    detail: { grantId: params.grantId },
  });
}

export async function listMoneyGrants(businessId: string, now = new Date()) {
  const rows = await prisma.financialGrant.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((g) => ({
    ...g,
    active: !g.revokedAt && g.expiresAt > now && g.policyVersion === FINANCIAL_POLICY_VERSION,
  }));
}
