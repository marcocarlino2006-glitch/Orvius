import { NextResponse } from "next/server";
import { executeProposal, type ProposalParams } from "@/lib/copilot-execute";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { requireEntitledSession } from "@/lib/tenant";
import { z } from "zod";

const proposeSchema = z.object({
  action: z.enum(["assign_tech", "mark_contacted", "sms_followup"]),
  jobId: z.string().optional(),
  leadId: z.string().optional(),
  technicianId: z.string().optional(),
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
        actor: "owner",
        summary: `Declined: ${proposal.preview}`,
        jobId: params.jobId ?? null,
        leadId: params.leadId ?? null,
        idempotencyKey: `copilot:${proposal.id}:declined`,
      });
      return NextResponse.json({ ok: true, proposalId: proposal.id, status: "cancelled" });
    }

    if (mode === "execute") {
      const body = executeSchema.parse(await request.json());
      const outcome = await executeProposal({ business, proposalId: body.proposalId });
      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.error, reason: outcome.reason }, { status: outcome.status });
      }
      return NextResponse.json(outcome);
    }

    const body = proposeSchema.parse(await request.json());
    let preview = "";
    const params: Record<string, string> = {};

    if (body.action === "assign_tech") {
      if (!body.jobId || !body.technicianId) {
        return NextResponse.json(
          { error: "jobId and technicianId required" },
          { status: 400 },
        );
      }
      const job = await prisma.job.findFirst({
        where: { id: body.jobId, businessId: business.id },
        include: { customer: true, lead: true },
      });
      const tech = await prisma.technician.findFirst({
        where: { id: body.technicianId, businessId: business.id },
      });
      if (!job || !tech) {
        return NextResponse.json({ error: "Job or technician not found" }, { status: 404 });
      }
      params.jobId = job.id;
      params.technicianId = tech.id;
      const slot = job.scheduledAt
        ? ` for ${job.scheduledAt.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: business.timezone ?? undefined })}`
        : "";
      preview = `Assign ${tech.name} to “${job.title}”${slot}${tech.phone ? " and text them the job details" : ""}.`;
    } else if (body.action === "mark_contacted") {
      if (!body.leadId) {
        return NextResponse.json({ error: "leadId required" }, { status: 400 });
      }
      const lead = await prisma.lead.findFirst({
        where: { id: body.leadId, businessId: business.id },
      });
      if (!lead) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      params.leadId = lead.id;
      preview = `Mark lead “${lead.name ?? lead.phone ?? lead.id}” as contacted.`;
    } else if (body.action === "sms_followup") {
      if (!body.leadId) {
        return NextResponse.json({ error: "leadId required" }, { status: 400 });
      }
      const lead = await prisma.lead.findFirst({
        where: { id: body.leadId, businessId: business.id },
      });
      if (!lead?.phone) {
        return NextResponse.json({ error: "Lead has no phone" }, { status: 400 });
      }
      params.leadId = lead.id;
      preview = `Text ${lead.name ?? lead.phone} a follow-up from ${business.name}.`;
    }

    const proposal = await prisma.copilotAction.create({
      data: {
        businessId: business.id,
        action: body.action,
        paramsJson: JSON.stringify(params),
        preview,
        status: "proposed",
      },
    });

    return NextResponse.json({
      proposalId: proposal.id,
      action: proposal.action,
      preview: proposal.preview,
      params,
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
