import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type AuditActor = "orvius" | "owner" | "teammate" | "system" | "technician" | "customer";

export type AuditInput = {
  businessId: string;
  entityType: "call" | "lead" | "customer" | "job" | "technician" | "notification" | "copilot" | "shop";
  entityId: string;
  action: string;
  summary: string;
  actor?: AuditActor;
  /** Sign-in email of the person who acted; omit for Orvius and system actions. */
  actorEmail?: string | null;
  detail?: Record<string, unknown> | null;
  callId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  /** Same key → written once, however many times the webhook is retried. */
  idempotencyKey?: string | null;
};

/** Actor fields for a change a signed-in person made. */
export function personActor(session: { role: string; email: string }): { actor: AuditActor; actorEmail: string } {
  return { actor: session.role === "owner" ? "owner" : "teammate", actorEmail: session.email };
}

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
        actorEmail: input.actorEmail?.trim().toLowerCase() || null,
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

/** Filters the activity log understands. Entity types and actors, as stored. */
export const AUDIT_ENTITY_TYPES = ["call", "lead", "customer", "job", "technician", "notification", "copilot", "shop"] as const;
export const AUDIT_ACTORS = ["orvius", "owner", "teammate", "system"] as const;

export type AuditLogRow = AuditRow & {
  entityType: string;
  entityId: string;
  actorEmail: string | null;
  callId: string | null;
  leadId: string | null;
  customerId: string | null;
  jobId: string | null;
};

export type AuditLogQuery = {
  businessId: string;
  entityType?: string | null;
  actor?: string | null;
  /** Matches the summary, the action code, or who acted. */
  q?: string | null;
  from?: Date | null;
  to?: Date | null;
  /** Keyset cursor: the `id` of the last row of the previous page. */
  cursor?: string | null;
  take?: number;
};

export async function listAuditLog(params: AuditLogQuery): Promise<{ rows: AuditLogRow[]; nextCursor: string | null }> {
  const take = Math.min(Math.max(params.take ?? 50, 1), 500);
  const q = params.q?.trim();
  const rows = await prisma.auditEvent.findMany({
    where: {
      businessId: params.businessId,
      ...((AUDIT_ENTITY_TYPES as readonly string[]).includes(params.entityType ?? "") ? { entityType: params.entityType! } : {}),
      ...((AUDIT_ACTORS as readonly string[]).includes(params.actor ?? "") ? { actor: params.actor! } : {}),
      ...(params.from || params.to
        ? { createdAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lt: params.to } : {}) } }
        : {}),
      ...(q ? { OR: [{ summary: { contains: q } }, { action: { contains: q } }, { actorEmail: { contains: q.toLowerCase() } }] } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, take);
  return {
    rows: page.map((r) => ({
      id: r.id,
      at: r.createdAt.toISOString(),
      action: r.action,
      actor: (r.actor as AuditActor) ?? "orvius",
      actorEmail: r.actorEmail,
      summary: r.summary,
      detail: r.detailJson ? (JSON.parse(r.detailJson) as Record<string, unknown>) : null,
      entityType: r.entityType,
      entityId: r.entityId,
      callId: r.callId,
      leadId: r.leadId,
      customerId: r.customerId,
      jobId: r.jobId,
    })),
    nextCursor: rows.length > take ? page[page.length - 1].id : null,
  };
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // A leading = + - @ makes spreadsheets evaluate the cell; prefix it so it stays text.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function auditLogCsv(rows: AuditLogRow[]): string {
  const head = ["time", "action", "actor", "actor_email", "entity_type", "entity_id", "summary", "detail"];
  const body = rows.map((r) => [r.at, r.action, r.actor, r.actorEmail, r.entityType, r.entityId, r.summary, r.detail].map(csvCell).join(","));
  return [head.join(","), ...body].join("\r\n") + "\r\n";
}
