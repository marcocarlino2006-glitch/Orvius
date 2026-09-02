import { NextResponse } from "next/server";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { requirePlanModule } from "@/lib/plan-gate";
import { prisma } from "@/lib/prisma";
import { requireBusinessSession } from "@/lib/tenant";
import { sendSms } from "@/lib/twilio-sms";
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

export async function POST(request: Request) {
  const authResult = await requireBusinessSession();
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
      return NextResponse.json({ ok: true, proposalId: proposal.id, status: "cancelled" });
    }

    if (mode === "execute") {
      const body = executeSchema.parse(await request.json());
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

      const params = JSON.parse(proposal.paramsJson) as {
        jobId?: string;
        leadId?: string;
        technicianId?: string;
      };

      let result: Record<string, unknown> = {};

      if (proposal.action === "assign_tech") {
        if (!params.jobId || !params.technicianId) {
          return NextResponse.json({ error: "Invalid assign params" }, { status: 400 });
        }
        const existing = await prisma.job.findFirst({
          where: { id: params.jobId, businessId: business.id },
        });
        if (!existing) {
          return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        const tech = await prisma.technician.findFirst({
          where: { id: params.technicianId, businessId: business.id },
        });
        if (!tech) {
          return NextResponse.json({ error: "Technician not found" }, { status: 404 });
        }
        await prisma.job.update({
          where: { id: params.jobId },
          data: { technicianId: params.technicianId },
        });
        const sms = await notifyTechOnAssign({
          jobId: params.jobId,
          previousTechnicianId: existing.technicianId,
          nextTechnicianId: params.technicianId,
        });
        result = { jobId: params.jobId, technicianId: params.technicianId, techSms: sms };
      } else if (proposal.action === "mark_contacted") {
        if (!params.leadId) {
          return NextResponse.json({ error: "Invalid lead params" }, { status: 400 });
        }
        const lead = await prisma.lead.findFirst({
          where: { id: params.leadId, businessId: business.id },
        });
        if (!lead) {
          return NextResponse.json({ error: "Lead not found" }, { status: 404 });
        }
        await prisma.lead.update({
          where: { id: params.leadId },
          data: { status: "contacted" },
        });
        result = { leadId: params.leadId, status: "contacted" };
      } else if (proposal.action === "sms_followup") {
        if (!params.leadId) {
          return NextResponse.json({ error: "Invalid lead params" }, { status: 400 });
        }
        const lead = await prisma.lead.findFirst({
          where: { id: params.leadId, businessId: business.id },
        });
        if (!lead?.phone) {
          return NextResponse.json({ error: "Lead has no phone" }, { status: 400 });
        }
        const message = `Hi${lead.name ? ` ${lead.name}` : ""} — this is ${business.name}. We received your service request and will follow up shortly. Reply STOP to opt out.`;
        const sms = await sendSms({ to: lead.phone, body: message });
        if (!sms) {
          return NextResponse.json({ error: "SMS unavailable" }, { status: 503 });
        }
        if (lead.status === "new") {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { status: "contacted" },
          });
        }
        result = { leadId: lead.id, smsSid: sms.sid };
      }

      await prisma.copilotAction.update({
        where: { id: proposal.id },
        data: {
          status: "executed",
          executedAt: new Date(),
          resultJson: JSON.stringify(result),
        },
      });

      return NextResponse.json({ ok: true, result, proposalId: proposal.id });
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
      preview = `Assign ${tech.name} to “${job.title}”${tech.phone ? " and SMS them the job details" : ""}.`;
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
          : "Copilot action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
