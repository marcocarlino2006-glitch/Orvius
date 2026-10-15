import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit, personActor } from "@/lib/audit";
import { COMMAND_ACTION_EFFECT, COMMAND_POLICY_VERSION, grantableAction } from "@/lib/command-authority";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/tenant";

/*
  Command grants: the owner alone issues and revokes them. A grant names one
  person, one kind of plan and its effect, any conditions, an expiry and the
  policy version; every plan is rechecked against it when it runs.
*/

const MAX_GRANT_DAYS = 90;

const createSchema = z.object({
  granteeEmail: z.string().email(),
  action: z.string(),
  expiresAt: z.string(),
  conditions: z.object({ allowSelfExecution: z.boolean().optional() }).strict().optional(),
});

export async function GET() {
  const owner = await requirePermission("command.approve");
  if ("error" in owner) return owner.error;
  const grants = await prisma.commandGrant.findMany({
    where: { businessId: owner.business.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({
    policyVersion: COMMAND_POLICY_VERSION,
    grants: grants.map((g) => ({
      id: g.id,
      granteeEmail: g.granteeEmail,
      action: g.action,
      effect: g.effect,
      conditions: JSON.parse(g.conditionsJson),
      expiresAt: g.expiresAt.toISOString(),
      policyVersion: g.policyVersion,
      grantedBy: g.grantedByEmail,
      revokedAt: g.revokedAt?.toISOString() ?? null,
      current: !g.revokedAt && g.expiresAt > new Date() && g.policyVersion === COMMAND_POLICY_VERSION,
    })),
  });
}

export async function POST(request: Request) {
  const owner = await requirePermission("command.approve");
  if ("error" in owner) return owner.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Name the person, the kind of plan and when the grant ends." }, { status: 400 });
  const { action, conditions } = parsed.data;
  const granteeEmail = parsed.data.granteeEmail.trim().toLowerCase();
  if (!grantableAction(action)) {
    return NextResponse.json({ error: "That kind of plan can't be granted. Money, settings, phone, team and deletion stay with the owner." }, { status: 400 });
  }
  const expiresAt = new Date(parsed.data.expiresAt);
  const now = Date.now();
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now || expiresAt.getTime() > now + MAX_GRANT_DAYS * 86_400_000) {
    return NextResponse.json({ error: `A grant ends within ${MAX_GRANT_DAYS} days.` }, { status: 400 });
  }
  if (granteeEmail === owner.email) return NextResponse.json({ error: "The owner already holds every Command right." }, { status: 400 });
  const member = await prisma.membership.findFirst({ where: { businessId: owner.business.id, email: granteeEmail }, select: { id: true } });
  if (!member) return NextResponse.json({ error: "Grants go to people already on the team." }, { status: 400 });
  if (conditions?.allowSelfExecution && COMMAND_ACTION_EFFECT[action].risk === "high") {
    return NextResponse.json({ error: "Plans that reach a customer can't be self-approved." }, { status: 400 });
  }
  const effect = COMMAND_ACTION_EFFECT[action].effect;
  const grant = await prisma.commandGrant.create({
    data: {
      businessId: owner.business.id,
      granteeEmail,
      action,
      effect,
      conditionsJson: JSON.stringify(conditions ?? {}),
      expiresAt,
      policyVersion: COMMAND_POLICY_VERSION,
      grantedByEmail: owner.email,
    },
  });
  await recordAudit({
    businessId: owner.business.id,
    entityType: "copilot",
    entityId: grant.id,
    action: "command.grant_issued",
    ...personActor(owner),
    summary: `Let ${granteeEmail} approve plans that ${effect}, until ${expiresAt.toISOString().slice(0, 10)}.`,
    detail: { grantId: grant.id, granteeEmail, action, conditions: conditions ?? {}, expiresAt: expiresAt.toISOString(), policyVersion: COMMAND_POLICY_VERSION },
    idempotencyKey: `command-grant:${grant.id}:issued`,
  });
  return NextResponse.json({ ok: true, grantId: grant.id });
}

export async function DELETE(request: Request) {
  const owner = await requirePermission("command.approve");
  if ("error" in owner) return owner.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const revoked = await prisma.commandGrant.updateMany({
    where: { id, businessId: owner.business.id, revokedAt: null },
    data: { revokedAt: new Date(), revokedByEmail: owner.email },
  });
  if (!revoked.count) return NextResponse.json({ error: "No active grant with that id" }, { status: 404 });
  await recordAudit({
    businessId: owner.business.id,
    entityType: "copilot",
    entityId: id,
    action: "command.grant_revoked",
    ...personActor(owner),
    summary: "Revoked a Command grant.",
    detail: { grantId: id },
    idempotencyKey: `command-grant:${id}:revoked`,
  });
  return NextResponse.json({ ok: true });
}
