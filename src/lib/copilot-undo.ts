import { personActor, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const UNDO_MS = 24 * 60 * 60 * 1000;

export type UndoOutcome =
  | { ok: false; error: string; status: number }
  | { ok: true; proposalId: string; summary: string };

type Snapshot = {
  jobId?: string;
  leadId?: string;
  technicianId?: string;
  previousTechnicianId?: string | null;
  from?: string | null;
  to?: string;
  previousStatus?: string;
  previousFirstContactedAt?: string | null;
  previousLeadStatus?: string;
  smsSid?: string;
};

export async function undoProposal(params: {
  business: { id: string };
  proposalId: string;
  by?: { role: string; email: string };
}): Promise<UndoOutcome> {
  const proposal = await prisma.copilotAction.findFirst({
    where: { id: params.proposalId, businessId: params.business.id },
  });
  if (!proposal) return { ok: false, error: "That action is gone.", status: 404 };
  if (proposal.status === "undone") return { ok: true, proposalId: proposal.id, summary: "Already undone." };
  if (proposal.status !== "executed") return { ok: false, error: "Nothing to undo.", status: 409 };
  if (!proposal.executedAt || Date.now() - proposal.executedAt.getTime() > UNDO_MS) {
    return { ok: false, error: "That change is older than a day. Move it by hand.", status: 409 };
  }

  const claimed = await prisma.copilotAction.updateMany({
    where: { id: proposal.id, businessId: params.business.id, status: "executed" },
    data: { status: "undoing" },
  });
  if (claimed.count === 0) return { ok: false, error: "That action is already being undone.", status: 409 };

  const snap = (proposal.resultJson ? JSON.parse(proposal.resultJson) : {}) as Snapshot;
  let summary = "Undid the last Ask action.";

  try {
    if (proposal.action === "assign_tech" && snap.jobId) {
      const job = await prisma.job.findFirst({ where: { id: snap.jobId, businessId: params.business.id } });
      if (!job) throw new Error("The job is gone.");
      if (job.status === "en_route" || job.status === "on_site" || job.status === "completed") {
        throw new Error("The technician is already on it. Call them if this was a mistake.");
      }
      if (job.technicianId !== snap.technicianId) {
        throw new Error("Someone else already reassigned this job.");
      }
      await prisma.job.update({ where: { id: job.id }, data: { technicianId: snap.previousTechnicianId ?? null } });
      summary = snap.previousTechnicianId ? "Put the previous technician back on the job." : "Took the technician off the job.";
    } else if (proposal.action === "reschedule" && snap.jobId) {
      const job = await prisma.job.findFirst({ where: { id: snap.jobId, businessId: params.business.id } });
      if (!job) throw new Error("The job is gone.");
      if (job.status === "en_route" || job.status === "on_site" || job.status === "completed") {
        throw new Error("The technician is already on it. Call them if this was a mistake.");
      }
      await prisma.job.update({
        where: { id: job.id },
        data: { scheduledAt: snap.from ? new Date(snap.from) : job.scheduledAt },
      });
      summary = "Moved the job back to the earlier time.";
    } else if (proposal.action === "book_window" && snap.jobId) {
      const job = await prisma.job.findFirst({ where: { id: snap.jobId, businessId: params.business.id } });
      if (!job) throw new Error("The job is gone.");
      if (job.status === "en_route" || job.status === "on_site" || job.status === "completed") {
        throw new Error("That visit already started. Cancel it from the job if you must.");
      }
      await prisma.job.update({ where: { id: job.id }, data: { status: "cancelled" } });
      if (snap.leadId && snap.previousLeadStatus) {
        await prisma.lead.updateMany({
          where: { id: snap.leadId, businessId: params.business.id },
          data: { status: snap.previousLeadStatus },
        });
      }
      summary = "Cancelled the job Ask just booked.";
    } else if ((proposal.action === "mark_contacted" || proposal.action === "sms_followup") && snap.leadId) {
      if (snap.previousStatus && snap.previousStatus !== "contacted") {
        await prisma.lead.updateMany({
          where: { id: snap.leadId, businessId: params.business.id, status: "contacted" },
          data: {
            status: snap.previousStatus,
            firstContactedAt: snap.previousFirstContactedAt ? new Date(snap.previousFirstContactedAt) : null,
          },
        });
      }
      summary = snap.smsSid
        ? "Marked them uncontacted. The text already went — it cannot be pulled back."
        : "Marked them uncontacted.";
    } else {
      throw new Error("This action cannot be undone from here.");
    }
  } catch (err) {
    await prisma.copilotAction.update({ where: { id: proposal.id }, data: { status: "executed" } });
    return { ok: false, error: err instanceof Error ? err.message : "Could not undo.", status: 409 };
  }

  await prisma.copilotAction.update({ where: { id: proposal.id }, data: { status: "undone" } });
  await recordAudit({
    businessId: params.business.id,
    entityType: snap.jobId ? "job" : snap.leadId ? "lead" : "copilot",
    entityId: snap.jobId ?? snap.leadId ?? proposal.id,
    action: "copilot.undone",
    ...(params.by ? personActor(params.by) : { actor: "owner" as const }),
    summary,
    detail: { proposalId: proposal.id, action: proposal.action },
    jobId: snap.jobId ?? null,
    leadId: snap.leadId ?? null,
    idempotencyKey: `copilot:${proposal.id}:undone`,
  });

  return { ok: true, proposalId: proposal.id, summary };
}
