import { NextResponse } from "next/server";
import { executeProposal, type ProposalParams } from "@/lib/copilot-execute";
import { undoProposal } from "@/lib/copilot-undo";
import { COPILOT_ACTIONS, proposeAction } from "@/lib/copilot-propose";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { personActor, recordAudit } from "@/lib/audit";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireEntitledSession } from "@/lib/tenant";
import { z } from "zod";

const proposeSchema = z.object({
  action: z.enum(COPILOT_ACTIONS),
  jobId: z.string().optional(),
  leadId: z.string().optional(),
  technicianId: z.string().optional(),
  at: z.string().datetime().optional(),
});

const executeSchema = z.object({
  proposalId: z.string().min(1),
  approved: z.literal(true),
});

const cancelSchema = z.object({
  proposalId: z.string().min(1),
});

/** List open approvals and the recent audit trail for Command. */
export async function GET() {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "ask");
  if ("error" in planGate) return planGate.error;

  const [proposals, activity] = await Promise.all([
    prisma.copilotAction.findMany({
      where: { businessId: business.id, status: "proposed" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.copilotAction.findMany({
      where: {
        businessId: business.id,
        status: { in: ["executed", "cancelled"] },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return NextResponse.json({
    proposals: proposals.map((p) => ({
      id: p.id,
      action: p.action,
      preview: p.preview,
      createdAt: p.createdAt.toISOString(),
    })),
    activity: activity.map((item) => ({
      id: item.id,
      action: item.action,
      preview: item.preview,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      executedAt: item.executedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "ask");
  if ("error" in planGate) return planGate.error;

  const limited = await sharedRateLimit({ key: `copilot:${business.id}`, limit: 30, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "propose";

  try {
    if (mode === "cancel") {
      const body = cancelSchema.parse(await request.json());
      const proposal = await prisma.copilotAction.findFirst({
        where: {
          id: body.proposalId,
          businessId: business.id,
          status: "proposed",
        },
      });
      if (!proposal) {
        return NextResponse.json({ error: "Proposal not found or already used" }, { status: 404 });
      }
      await prisma.copilotAction.update({
        where: { id: proposal.id },
        data: { status: "cancelled" },
      });
      const params = JSON.parse(proposal.paramsJson) as ProposalParams;
      await recordAudit({
        businessId: business.id,
        entityType: params.jobId ? "job" : params.leadId ? "lead" : "copilot",
        entityId: params.jobId ?? params.leadId ?? proposal.id,
        action: "copilot.declined",
        ...personActor(authResult),
        summary: `Declined: ${proposal.preview}`,
        jobId: params.jobId ?? null,
        leadId: params.leadId ?? null,
        idempotencyKey: `copilot:${proposal.id}:declined`,
      });
      return NextResponse.json({ ok: true, proposalId: proposal.id, status: "cancelled" });
    }

    if (mode === "execute") {
      const body = executeSchema.parse(await request.json());
      const outcome = await executeProposal({ business, proposalId: body.proposalId, by: authResult });
      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.error, reason: outcome.reason }, { status: outcome.status });
      }
      return NextResponse.json(outcome);
    }

    if (mode === "undo") {
      const body = cancelSchema.parse(await request.json());
      const outcome = await undoProposal({ business, proposalId: body.proposalId, by: authResult });
      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      }
      return NextResponse.json(outcome);
    }

    const body = proposeSchema.parse(await request.json());
    const outcome = await proposeAction(business, body);
    if (!outcome.ok) {
      return NextResponse.json(
        { error: outcome.error, reason: outcome.reason, alternatives: outcome.alternatives },
        { status: outcome.status },
      );
    }
    return NextResponse.json({
      proposalId: outcome.proposalId,
      action: outcome.action,
      preview: outcome.preview,
      params: outcome.params,
      risk: "high",
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Ask action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
