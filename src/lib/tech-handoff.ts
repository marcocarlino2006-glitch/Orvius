import { recordAudit, type AuditActor } from "@/lib/audit";
import { runAutopilot } from "@/lib/autopilot";
import { logWarn } from "@/lib/logger";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { prisma } from "@/lib/prisma";

export type HandedOffJob = { id: string; title: string; scheduledAt: string | null; technicianName: string | null };

/**
 * A technician who is off or gone can't keep jobs: a customer would wait for
 * someone who isn't coming. Their open jobs in the window come off them, the
 * same clear-cut assignment rules as autopilot pick someone else, and any job
 * nobody clearly fits stays unassigned on the owner's "Needs a tech" queue.
 */
export async function handOffTechnicianJobs(params: {
  businessId: string;
  technician: { id: string; name: string };
  from: Date;
  to?: Date;
  why: string;
  actor: { actor: AuditActor; actorEmail?: string | null };
}): Promise<HandedOffJob[]> {
  const jobs = await prisma.job.findMany({
    where: {
      businessId: params.businessId,
      technicianId: params.technician.id,
      status: { notIn: ["completed", "cancelled"] },
      scheduledAt: { gte: params.from, ...(params.to ? { lt: params.to } : {}) },
    },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, title: true, customerId: true, leadId: true },
  });
  if (!jobs.length) return [];

  const released = await prisma.job.updateMany({
    where: { id: { in: jobs.map((j) => j.id) }, technicianId: params.technician.id },
    data: { technicianId: null },
  });
  for (const job of jobs) {
    await notifyTechOnAssign({ jobId: job.id, previousTechnicianId: params.technician.id, nextTechnicianId: null }).catch((error: unknown) =>
      logWarn("tech_handoff.notify_failed", { jobId: job.id, error: error instanceof Error ? error.message : "unknown" }),
    );
    await recordAudit({
      businessId: params.businessId,
      entityType: "job",
      entityId: job.id,
      action: "technician.released",
      ...params.actor,
      summary: `Took ${job.title} off ${params.technician.name}: ${params.why}.`,
      detail: { technicianId: params.technician.id },
      jobId: job.id,
      customerId: job.customerId,
      leadId: job.leadId,
    });
  }
  if (released.count) await runAutopilot(params.businessId, { force: true });

  const after = await prisma.job.findMany({
    where: { id: { in: jobs.map((j) => j.id) } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, title: true, scheduledAt: true, technician: { select: { name: true } } },
  });
  return after.map((j) => ({
    id: j.id,
    title: j.title,
    scheduledAt: j.scheduledAt?.toISOString() ?? null,
    technicianName: j.technician?.name ?? null,
  }));
}
