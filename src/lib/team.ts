import type { Business } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/stripe";
import { ROLE_DETAILS, ROLE_LABELS, isMemberRole, type MemberRole, type ShopRole } from "@/lib/workspace-access";

export const MAX_TEAM_SIZE = 50;

export type TeamPerson = {
  id: string | null;
  email: string;
  role: ShopRole;
  lastSeenAt: string | null;
  addedAt: string | null;
  you: boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeInviteEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export async function listTeam(business: Pick<Business, "id" | "ownerEmail">, viewerEmail: string): Promise<TeamPerson[]> {
  const members = await prisma.membership.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" } });
  const owner = business.ownerEmail?.toLowerCase() ?? null;
  return [
    ...(owner ? [{ id: null, email: owner, role: "owner" as const, lastSeenAt: null, addedAt: null, you: owner === viewerEmail }] : []),
    ...members
      .filter((m) => m.email !== owner)
      .map((m) => ({
        id: m.id,
        email: m.email,
        role: (isMemberRole(m.role) ? m.role : "dispatcher") as ShopRole,
        lastSeenAt: m.lastSeenAt?.toISOString() ?? null,
        addedAt: m.createdAt.toISOString(),
        you: m.email === viewerEmail,
      })),
  ];
}

export type InviteResult =
  | { ok: true; person: TeamPerson; emailed: boolean; signInUrl: string }
  | { ok: false; status: number; error: string };

export async function inviteTeammate(params: {
  business: Pick<Business, "id" | "name" | "ownerEmail">;
  email: unknown;
  role: unknown;
  invitedBy: string;
}): Promise<InviteResult> {
  const email = normalizeInviteEmail(params.email);
  if (!email) return { ok: false, status: 400, error: "Enter a valid email address." };
  if (!isMemberRole(params.role)) return { ok: false, status: 400, error: "Pick Manager or Dispatcher." };
  const role: MemberRole = params.role;
  if (email === params.business.ownerEmail?.toLowerCase()) {
    return { ok: false, status: 409, error: "That's the owner's email. They already have full access." };
  }
  const existing = await prisma.membership.findUnique({ where: { businessId_email: { businessId: params.business.id, email } } });
  if (existing) return { ok: false, status: 409, error: `${email} already has access.` };
  const count = await prisma.membership.count({ where: { businessId: params.business.id } });
  if (count >= MAX_TEAM_SIZE) return { ok: false, status: 400, error: `A shop can have up to ${MAX_TEAM_SIZE} teammates.` };

  const created = await prisma.membership.create({
    data: { businessId: params.business.id, email, role, invitedBy: params.invitedBy },
  });
  await recordAudit({
    businessId: params.business.id,
    entityType: "shop",
    entityId: params.business.id,
    action: "team.added",
    actor: params.invitedBy === params.business.ownerEmail?.toLowerCase() ? "owner" : "teammate",
    summary: `${params.invitedBy} gave ${email} ${ROLE_LABELS[role]} access.`,
    detail: { email, role, by: params.invitedBy },
  });

  const signInUrl = `${getAppBaseUrl()}/signin`;
  let emailed = false;
  if (isEmailConfigured()) {
    emailed = await sendOwnerEmail({
      to: email,
      subject: `You now have access to ${params.business.name} on Orvius`,
      text: [
        `${params.invitedBy} added you to ${params.business.name} on Orvius as ${ROLE_LABELS[role]}.`,
        ROLE_DETAILS[role],
        "",
        `Sign in with this email address (${email}): ${signInUrl}`,
      ].join("\n"),
    })
      .then(() => true)
      .catch(() => false);
  }

  return {
    ok: true,
    emailed,
    signInUrl,
    person: { id: created.id, email, role, lastSeenAt: null, addedAt: created.createdAt.toISOString(), you: false },
  };
}

export async function changeTeammateRole(params: {
  businessId: string;
  membershipId: string;
  role: unknown;
  by: string;
  byOwner: boolean;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!isMemberRole(params.role)) return { ok: false, status: 400, error: "Pick Manager or Dispatcher." };
  const member = await prisma.membership.findFirst({ where: { id: params.membershipId, businessId: params.businessId } });
  if (!member) return { ok: false, status: 404, error: "That person no longer has access." };
  if (member.email === params.by) return { ok: false, status: 400, error: "You can't change your own role." };
  if (member.role === params.role) return { ok: true };
  await prisma.membership.update({ where: { id: member.id }, data: { role: params.role } });
  await recordAudit({
    businessId: params.businessId,
    entityType: "shop",
    entityId: params.businessId,
    action: "team.role_changed",
    actor: params.byOwner ? "owner" : "teammate",
    summary: `${params.by} changed ${member.email} from ${ROLE_LABELS[member.role as MemberRole] ?? member.role} to ${ROLE_LABELS[params.role]}.`,
    detail: { email: member.email, from: member.role, to: params.role, by: params.by },
  });
  return { ok: true };
}

export async function removeTeammate(params: {
  businessId: string;
  membershipId: string;
  by: string;
  byOwner: boolean;
  canManage: boolean;
}): Promise<{ ok: true; self: boolean } | { ok: false; status: number; error: string }> {
  const member = await prisma.membership.findFirst({ where: { id: params.membershipId, businessId: params.businessId } });
  if (!member) return { ok: false, status: 404, error: "That person no longer has access." };
  const self = member.email === params.by;
  if (!self && !params.canManage) return { ok: false, status: 403, error: "Your role can't manage the team. Ask the shop owner." };
  await prisma.membership.delete({ where: { id: member.id } });
  await recordAudit({
    businessId: params.businessId,
    entityType: "shop",
    entityId: params.businessId,
    action: self ? "team.left" : "team.removed",
    actor: params.byOwner ? "owner" : "teammate",
    summary: self ? `${member.email} left the shop.` : `${params.by} removed ${member.email}.`,
    detail: { email: member.email, role: member.role, by: params.by },
  });
  return { ok: true, self };
}
