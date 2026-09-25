import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type AuditActor = "orvius" | "owner" | "system";

export type AuditInput = {
  businessId: string;
  entityType: "call" | "lead" | "customer" | "job" | "technician" | "notification" | "copilot" | "shop";
  entityId: string;
  action: string;
  summary: string;
  actor?: AuditActor;
  detail?: Record<string, unknown> | null;
  callId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  /** Same key → written once, however many times the webhook is retried. */
  idempotencyKey?: string | null;
};

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Record one decision. The audit trail must never be the reason a call fails
 * to book, so write errors are logged, not thrown.
 */
export async function recordAudit(input: AuditInput): Promise<string | null> {
  try {
    const row = await prisma.auditEvent.create({
      data: {
        businessId: input.businessId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actor: input.actor ?? "orvius",
        summary: input.summary.slice(0, 500),
        detailJson: input.detail ? JSON.stringify(input.detail) : null,
        callId: input.callId ?? null,
        leadId: input.leadId ?? null,
        customerId: input.customerId ?? null,
        jobId: input.jobId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    if (isUniqueConstraintError(error)) return null;
    logWarn("audit.write_failed", {
      action: input.action,
      entityId: input.entityId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

export type AuditQueue = {
  add(input: AuditInput): void;
  /** Resolves once every queued row is written (or has logged its failure). */
  flush(): Promise<void>;
};

/**
 * Writes audit rows one after another in the background, so a request can
 * keep working while its trail is recorded without the trail losing order.
 * recordAudit never throws, so one failed row cannot stall the rest.
 */
export function createAuditQueue(): AuditQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    add(input) {
      tail = tail.then(() => recordAudit(input));
    },
    async flush() {
      await tail;
    },
  };
}

export type AuditRow = {
  id: string;
  at: string;
  action: string;
  actor: AuditActor;
  summary: string;
  detail: Record<string, unknown> | null;
};

export async function listAuditFor(params: {
  businessId: string;
  callId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  take?: number;
}): Promise<AuditRow[]> {
  const or = [
    params.callId ? { callId: params.callId } : null,
    params.leadId ? { leadId: params.leadId } : null,
    params.customerId ? { customerId: params.customerId } : null,
    params.jobId ? { jobId: params.jobId } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  if (!or.length) return [];
  const rows = await prisma.auditEvent.findMany({
    where: { businessId: params.businessId, OR: or },
    orderBy: { createdAt: "desc" },
    take: params.take ?? 60,
  });
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    action: r.action,
    actor: (r.actor as AuditActor) ?? "orvius",
    summary: r.summary,
    detail: r.detailJson ? (JSON.parse(r.detailJson) as Record<string, unknown>) : null,
  }));
}
