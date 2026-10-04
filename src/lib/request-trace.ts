import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { isSimulatedSid } from "@/lib/sms-simulation";

export type TraceTone = "ok" | "failed" | "held" | "info";

export type TraceEvent = {
  id: string;
  at: string;
  source: "audit" | "text" | "alert";
  actor: string;
  title: string;
  tone: TraceTone;
  simulated?: boolean;
};

export type RequestTrace = {
  lead: { id: string; name: string | null; phone: string | null; serviceType: string | null; address: string | null; status: string; urgency: string | null; source: string; createdAt: string };
  job: { id: string; title: string; status: string; scheduledAt: string | null; customerConfirmedAt: string | null; technician: string | null } | null;
  takenOver: { by: string; since: string } | null;
  events: TraceEvent[];
};

const FAILED = /failed|undelivered|rejected/;
const HELD = /^(lead\.held|lead\.escalated|lead\.follow_up|sms\.held_for_human|owner\.alert_skipped|customer\.confirmation_skipped|copilot\.declined)$/;

function toneFor(action: string): TraceTone {
  if (FAILED.test(action)) return "failed";
  if (HELD.test(action)) return "held";
  if (/^(lead\.captured|job\.booked|job\.created|customer\.confirm|technician\.assigned|copilot\.executed|job\.rescheduled|owner\.alert_queued|conversation\.)/.test(action)) return "ok";
  return "info";
}

/**
 * One request from first ring to booked job: every decision Orvius made, every
 * text in and out, every alert and whether it landed. Failures stay in the
 * trail; they are what the owner most needs to see.
 */
export async function buildRequestTrace(businessId: string, leadId: string): Promise<RequestTrace | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, businessId },
    include: { job: { include: { technician: { select: { name: true } } } } },
  });
  if (!lead) return null;
  const phone = normalizePhone(lead.phone);
  const job = lead.job;
  const from = new Date(lead.createdAt.getTime() - 60 * 60_000);

  const [audits, messages, alerts, takeover] = await Promise.all([
    prisma.auditEvent.findMany({
      where: {
        businessId,
        OR: [
          { leadId: lead.id },
          ...(job ? [{ jobId: job.id }] : []),
          ...(lead.callId ? [{ callId: lead.callId }] : []),
          ...(phone ? [{ entityId: phone, createdAt: { gte: from } }] : []),
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    phone
      ? prisma.message.findMany({
          where: { businessId, phoneNormalized: phone, createdAt: { gte: from } },
          orderBy: { createdAt: "asc" },
          take: 100,
        })
      : [],
    prisma.ownerNotification.findMany({
      where: { businessId, leadId: lead.id },
      orderBy: { createdAt: "asc" },
    }),
    phone
      ? prisma.takeover.findUnique({ where: { businessId_phoneNormalized: { businessId, phoneNormalized: phone } } })
      : null,
  ]);

  const events: TraceEvent[] = [
    ...audits.map((a) => ({
      id: `audit:${a.id}`,
      at: a.createdAt.toISOString(),
      source: "audit" as const,
      actor: a.actorEmail ?? a.actor,
      title: a.summary,
      tone: toneFor(a.action),
    })),
    ...messages.map((m) => ({
      id: `text:${m.id}`,
      at: m.createdAt.toISOString(),
      source: "text" as const,
      actor: m.direction === "in" ? "customer" : m.author,
      title: `${m.direction === "in" ? "Customer texted" : "Texted the customer"}: ${m.body.slice(0, 140)}${
        m.deliveryStatus ? ` (${m.deliveryStatus})` : ""
      }`,
      tone: (m.deliveryStatus && FAILED.test(m.deliveryStatus) ? "failed" : "info") as TraceTone,
      simulated: isSimulatedSid(m.sid),
    })),
    ...alerts.map((n) => ({
      id: `alert:${n.id}`,
      at: (n.processedAt ?? n.createdAt).toISOString(),
      source: "alert" as const,
      actor: "orvius",
      title:
        n.status === "sent"
          ? `Owner ${n.channel} alert ${n.deliveryStatus === "simulated" ? "delivered (simulated)" : `sent${n.deliveryStatus ? ` · ${n.deliveryStatus}` : ""}`}`
          : n.status === "failed"
            ? `Owner ${n.channel} alert failed — ${n.error ?? "unknown error"}`
            : `Owner ${n.channel} alert ${n.status}`,
      tone: (n.status === "failed" ? "failed" : n.status === "sent" ? "ok" : "info") as TraceTone,
      simulated: n.deliveryStatus === "simulated",
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return {
    lead: {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      serviceType: lead.serviceType,
      address: lead.address,
      status: lead.status,
      urgency: lead.urgency,
      source: lead.source,
      createdAt: lead.createdAt.toISOString(),
    },
    job: job
      ? {
          id: job.id,
          title: job.title,
          status: job.status,
          scheduledAt: job.scheduledAt?.toISOString() ?? null,
          customerConfirmedAt: job.customerConfirmedAt?.toISOString() ?? null,
          technician: job.technician?.name ?? null,
        }
      : null,
    takenOver: takeover && !takeover.releasedAt ? { by: takeover.takenBy, since: takeover.createdAt.toISOString() } : null,
    events,
  };
}
