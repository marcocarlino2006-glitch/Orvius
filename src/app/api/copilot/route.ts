import { NextResponse } from "next/server";
import { executeProposal, needsCheck, readParams, resolveReconcile, STALE_EXECUTING_MS } from "@/lib/copilot-execute";
import { COPILOT_ACTIONS, proposeAction } from "@/lib/copilot-propose";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { personActor, writeAudit } from "@/lib/audit";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireEntitledSession } from "@/lib/tenant";
import { grantsForActor, mayResolve, mayWithdraw } from "@/lib/command-authority";
import { logWarn } from "@/lib/logger";
import { buildOutcome } from "@/lib/outcome";
import { recordWorkflowDecision, recordWorkflowProgress, recordWorkflowStart } from "@/lib/workflow-events";
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

const resolveSchema = z.object({
  proposalId: z.string().min(1),
  outcome: z.enum(["done", "not_done"]),
});

function parseResult(json: string | null) {
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Where one plan stands, read from the shop's own record: what Command asks
 * after a reply was lost, instead of guessing or offering it again.
 */
async function readBack(businessId: string, proposalId: string, now: Date) {
  const item = await prisma.copilotAction.findFirst({ where: { id: proposalId, businessId } });
  if (!item) return null;
  const result = parseResult(item.resultJson);
  const state =
    item.status === "executed"
      ? "done"
      : item.status === "cancelled"
        ? "withdrawn"
        : item.status === "proposed"
          ? result?.failedBeforeEffect === true
            ? "failed_before_effect"
            : "waiting_for_approval"
          : needsCheck(item, now)
            ? result?.done === true
              ? "done_unrecorded"
              : "needs_check"
            : "running";
  const params = readParams(item.paramsJson);
  const jobId = typeof result?.jobId === "string" ? result.jobId : (params?.jobId ?? null);
  const leadId = typeof result?.leadId === "string" ? result.leadId : (params?.leadId ?? null);
  const outcome = jobId || leadId ? await buildOutcome(businessId, { jobId, leadId }).catch(() => null) : null;
  return { proposal: { id: item.id, action: item.action, preview: item.preview, status: item.status, state, executedAt: item.executedAt?.toISOString() ?? null }, outcome };
}

/** List open approvals and the recent audit trail for Command, or read back one plan with ?proposalId=. */
export async function GET(request?: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "ask");
  if ("error" in planGate) return planGate.error;

  const now = new Date();
  const one = request ? new URL(request.url).searchParams.get("proposalId") : null;
  if (one) {
    const found = await readBack(business.id, one, now);
    return found ? NextResponse.json(found) : NextResponse.json({ error: "No such plan in this shop" }, { status: 404 });
  }
  const [proposals, flagged, activity] = await Promise.all([
    prisma.copilotAction.findMany({
      where: { businessId: business.id, status: "proposed" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.copilotAction.findMany({
      where: {
        businessId: business.id,
        OR: [
          { status: "reconcile" },
          { status: "executing", createdAt: { lt: new Date(now.getTime() - STALE_EXECUTING_MS) } },
        ],
      },
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
      lastAttemptFailed: parseResult(p.resultJson)?.failedBeforeEffect === true,
    })),
    needsCheck: flagged.filter((item) => needsCheck(item, now)).map((item) => {
      const result = parseResult(item.resultJson);
      return {
        id: item.id,
        action: item.action,
        preview: item.preview,
        createdAt: item.createdAt.toISOString(),
        state: result?.done === true ? "done_unrecorded" : "unknown",
        error: typeof result?.error === "string" ? result.error : null,
      };
    }),
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

  const actor = { role: authResult.role, email: authResult.email };

  try {
    if (mode === "resolve") {
      const body = resolveSchema.parse(await request.json());
      const item = await prisma.copilotAction.findFirst({ where: { id: body.proposalId, businessId: business.id }, select: { action: true } });
      if (item && !mayResolve(actor, item.action, await grantsForActor(business.id, actor.email))) {
        return NextResponse.json({ error: "Only the owner, or someone the owner granted this kind of plan, can resolve it." }, { status: 403 });
      }
      const outcome = await resolveReconcile({ business, proposalId: body.proposalId, happened: body.outcome === "done", by: authResult });
      if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      return NextResponse.json(outcome);
    }

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
      if (!mayWithdraw(actor, proposal, await grantsForActor(business.id, actor.email))) {
        return NextResponse.json({ error: "Only the owner, whoever asked for this plan, or a grant holder can withdraw it." }, { status: 403 });
      }
      const params = readParams(proposal.paramsJson) ?? {};
      const withdrawn = await prisma.copilotAction.updateMany({
        where: { id: proposal.id, status: "proposed" },
        data: { status: "cancelled" },
      });
      if (withdrawn.count === 0) {
        return NextResponse.json({ error: "This plan already started, so it can't be withdrawn. If it stops partway it is flagged to check." }, { status: 409 });
      }
      const recorded = await writeAudit({
        businessId: business.id,
        entityType: params.jobId ? "job" : params.leadId ? "lead" : "copilot",
        entityId: params.jobId ?? params.leadId ?? proposal.id,
        action: "copilot.declined",
        ...personActor(authResult),
        summary: `Declined: ${proposal.preview}`,
        jobId: params.jobId ?? null,
        leadId: params.leadId ?? null,
        idempotencyKey: `copilot:${proposal.id}:declined`,
      }).then(
        () => true,
        (error: unknown) => {
          logWarn("copilot.declined_unrecorded", { proposalId: proposal.id, error: error instanceof Error ? error.message : "unknown" });
          return false;
        },
      );
      return NextResponse.json({ ok: true, proposalId: proposal.id, status: "cancelled", recorded });
    }

    if (mode === "execute") {
      const body = executeSchema.parse(await request.json());
      const outcome = await executeProposal({ business, proposalId: body.proposalId, by: authResult }).catch((error: unknown) => {
        logWarn("copilot.execute_unknown", { proposalId: body.proposalId, error: error instanceof Error ? error.message : "unknown" });
        return {
          ok: false as const,
          error: "Orvius couldn't tell whether this ran. It won't run again on its own; refresh Command to see, and check it before approving again.",
          status: 500,
          reason: "unknown",
        };
      });
      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.error, reason: outcome.reason }, { status: outcome.status });
      }
      const jobId = typeof outcome.result?.jobId === "string" ? outcome.result.jobId : null;
      const leadId = typeof outcome.result?.leadId === "string" ? outcome.result.leadId : null;
      const view = jobId || leadId ? await buildOutcome(business.id, { jobId, leadId }).catch(() => null) : null;
      /* The plan already ran; reporting is best-effort, so it can never turn a success into an error the owner retries. */
      if (view) {
        try {
          const who = { actor: personActor(authResult).actor as "owner" | "teammate", email: authResult.email };
          const action = await prisma.copilotAction.findUnique({ where: { id: outcome.proposalId }, select: { action: true } });
          if (action?.action === "book_window") await recordWorkflowStart(view, who, "Command");
          await recordWorkflowDecision(view, action?.action === "assign_tech" ? "chose_assignment" : "approved_plan", who, outcome.proposalId);
          await recordWorkflowProgress(view, who);
        } catch (error) {
          logWarn("workflow.report_failed", { proposalId: outcome.proposalId, error: error instanceof Error ? error.message : "unknown" });
        }
      }
      return NextResponse.json({ ...outcome, outcome: view });
    }

    const body = proposeSchema.parse(await request.json());
    const outcome = await proposeAction(business, body, actor);
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
