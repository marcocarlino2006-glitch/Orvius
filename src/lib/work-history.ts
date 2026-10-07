import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { isSimulatedSid } from "@/lib/sms-simulation";

/*
  Everything that happened to one piece of work, in order: the call, every
  text either way, every alert, every change, and who did it. "Who" is the
  point. An owner trusting Orvius with the shop has to be able to see, for
  any job, which steps Orvius took on its own and which a person took.
*/

export type HistoryWho = "orvius" | "person" | "customer" | "technician";
export type HistoryKind = "call" | "text" | "alert" | "change";
export type HistoryTone = "ok" | "failed" | "held" | "info";

export type HistoryEvent = {
  id: string;
  at: string;
  kind: HistoryKind;
  who: HistoryWho;
  /** "Orvius", a teammate's email, "Customer" or the technician's name. */
  whoLabel: string;
  title: string;
  detail?: string | null;
  tone: HistoryTone;
  simulated?: boolean;
  href?: string | null;
};

const FAILED = /failed|undelivered|rejected/;
const HELD = /^(lead\.held|lead\.escalated|lead\.follow_up|sms\.held_for_human|owner\.alert_skipped|customer\.confirmation_skipped|copilot\.declined)$/;
const OK = /^(lead\.captured|job\.booked|job\.created|customer\.confirm|technician\.assigned|autopilot\.|copilot\.executed|job\.rescheduled|job\.status|owner\.alert_queued|conversation\.|work\.assigned)/;

function tone(action: string): HistoryTone {
  if (FAILED.test(action)) return "failed";
  if (HELD.test(action)) return "held";
  if (OK.test(action)) return "ok";
  return "info";
}

function whoFor(actor: string, email: string | null, technician?: string | null): { who: HistoryWho; whoLabel: string } {
  if (actor === "orvius" || actor === "system") return { who: "orvius", whoLabel: "Orvius" };
  if (actor === "technician") return { who: "technician", whoLabel: email ?? technician ?? "Technician" };
  if (actor === "customer") return { who: "customer", whoLabel: "Customer" };
  return { who: "person", whoLabel: email ?? (actor === "owner" ? "You" : "Your team") };
}

function seconds(n: number | null) {
  if (!n) return null;
  return n >= 60 ? `${Math.round(n / 60)} min` : `${n}s`;
}

/** The history of a request or a job. Null when it is not this shop's. */
export async function workHistory(businessId: string, target: { kind: "request" | "job"; id: string }): Promise<HistoryEvent[] | null> {
  const job =
    target.kind === "job"
      ? await prisma.job.findFirst({
          where: { id: target.id, businessId },
          select: { id: true, leadId: true, createdAt: true, customer: { select: { phone: true } }, technician: { select: { name: true, phone: true } } },
        })
      : await prisma.job.findFirst({
          where: { leadId: target.id, businessId },
          select: { id: true, leadId: true, createdAt: true, customer: { select: { phone: true } }, technician: { select: { name: true, phone: true } } },
        });
  const leadId = target.kind === "request" ? target.id : (job?.leadId ?? null);
  const lead = leadId
    ? await prisma.lead.findFirst({ where: { id: leadId, businessId }, select: { id: true, callId: true, phone: true, createdAt: true } })
    : null;
  if (target.kind === "request" ? !lead : !job) return null;

  const phone = normalizePhone(lead?.phone ?? job?.customer?.phone ?? null);
  const startedAt = lead?.createdAt ?? job!.createdAt;
  const from = new Date(startedAt.getTime() - 60 * 60_000);

  const [audits, messages, alerts, calls, techTexts, crew] = await Promise.all([
    prisma.auditEvent.findMany({
      where: {
        businessId,
        OR: [
          ...(lead ? [{ leadId: lead.id }] : []),
          ...(job ? [{ jobId: job.id }, { entityType: "job", entityId: job.id }] : []),
          ...(lead?.callId ? [{ callId: lead.callId }] : []),
          ...(phone ? [{ entityId: phone, createdAt: { gte: from } }] : []),
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
    phone
      ? prisma.message.findMany({ where: { businessId, phoneNormalized: phone, createdAt: { gte: from } }, orderBy: { createdAt: "asc" }, take: 200 })
      : [],
    lead ? prisma.ownerNotification.findMany({ where: { businessId, leadId: lead.id }, orderBy: { createdAt: "asc" } }) : [],
    prisma.call.findMany({
      where: {
        businessId,
        OR: [...(lead?.callId ? [{ id: lead.callId }] : []), ...(phone ? [{ callerPhone: phone, createdAt: { gte: from } }] : [])],
      },
      select: { id: true, createdAt: true, durationSec: true, summary: true, status: true, direction: true },
      orderBy: { createdAt: "asc" },
      take: 20,
    }),
    /* Texts to the technician about this job: the proof they were told. */
    job
      ? prisma.outboundSms.findMany({
          where: { businessId, jobId: job.id, audience: "tech", body: { not: null } },
          orderBy: { createdAt: "asc" },
          take: 50,
        })
      : [],
    job ? prisma.technician.findMany({ where: { businessId }, select: { name: true, phone: true } }) : [],
  ]);

  const techByPhone = new Map(crew.flatMap((t) => {
    const p = normalizePhone(t.phone);
    return p ? [[p, t.name] as const] : [];
  }));
  const seen = new Set<string>();
  const once = <T extends { id: string }>(e: T) => (seen.has(e.id) ? false : (seen.add(e.id), true));

  const events: HistoryEvent[] = [
    ...calls.map(
      (c): HistoryEvent => ({
        id: `call:${c.id}`,
        at: c.createdAt.toISOString(),
        kind: "call",
        who: c.direction === "outbound" ? "orvius" : "customer",
        whoLabel: c.direction === "outbound" ? "Orvius" : "Customer",
        title: c.direction === "outbound" ? "Orvius called the customer" : `Called in${seconds(c.durationSec) ? ` · ${seconds(c.durationSec)}` : ""} — Orvius answered`,
        detail: c.summary,
        tone: c.status === "failed" ? "failed" : "info",
        href: `/dashboard/calls/${c.id}`,
      }),
    ),
    ...audits.map(
      (a): HistoryEvent => ({
        id: `audit:${a.id}`,
        at: a.createdAt.toISOString(),
        kind: a.action.startsWith("owner.alert") ? "alert" : "change",
        ...whoFor(a.actor, a.actorEmail, job?.technician?.name),
        title: a.summary,
        tone: tone(a.action),
      }),
    ),
    ...messages.map(
      (m): HistoryEvent => ({
        id: `text:${m.id}`,
        at: m.createdAt.toISOString(),
        kind: "text",
        ...(m.direction === "in"
          ? { who: "customer" as const, whoLabel: "Customer" }
          : m.author === "orvius"
            ? { who: "orvius" as const, whoLabel: "Orvius" }
            : { who: "person" as const, whoLabel: "You" }),
        title: m.direction === "in" ? "Customer texted" : "Texted the customer",
        detail: `${m.body.slice(0, 280)}${m.deliveryStatus ? ` — ${m.deliveryStatus}` : ""}`,
        tone: m.deliveryStatus && FAILED.test(m.deliveryStatus) ? "failed" : "info",
        simulated: isSimulatedSid(m.sid),
      }),
    ),
    ...techTexts.map(
      (m): HistoryEvent => ({
        id: `tech-text:${m.id}`,
        at: m.createdAt.toISOString(),
        kind: "text",
        who: "orvius",
        whoLabel: "Orvius",
        title: `Texted ${techByPhone.get(m.toNormalized) ?? "the technician"}`,
        detail: `${(m.body ?? "").slice(0, 280)}${m.deliveryStatus ? ` — ${m.deliveryStatus}` : ""}`,
        tone: m.deliveryStatus && FAILED.test(m.deliveryStatus) ? "failed" : m.deliveryStatus === "delivered" ? "ok" : "info",
        simulated: isSimulatedSid(m.sid),
      }),
    ),
    ...alerts.map(
      (n): HistoryEvent => ({
        id: `alert:${n.id}`,
        at: (n.processedAt ?? n.createdAt).toISOString(),
        kind: "alert",
        who: "orvius",
        whoLabel: "Orvius",
        title:
          n.status === "sent"
            ? `Alerted you by ${n.channel === "sms" ? "text" : n.channel}${n.deliveryStatus && n.deliveryStatus !== "simulated" ? ` · ${n.deliveryStatus}` : ""}`
            : n.status === "failed"
              ? `Your ${n.channel === "sms" ? "text" : n.channel} alert failed — ${n.error ?? "unknown error"}`
              : `Your ${n.channel === "sms" ? "text" : n.channel} alert is ${n.status}`,
        tone: n.status === "failed" ? "failed" : n.status === "sent" ? "ok" : "info",
        simulated: n.deliveryStatus === "simulated",
      }),
    ),
  ].filter(once);

  return events.sort((a, b) => a.at.localeCompare(b.at));
}
