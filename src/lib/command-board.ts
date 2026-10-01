import { formatShopTime } from "@/lib/availability";
import { prisma } from "@/lib/prisma";
import { findDuplicateJobs } from "@/lib/workspace-hygiene";

/**
 * Command's daily board: everything that came in, what Orvius proposed, what
 * the customer locked in, what broke, and what waits on the owner. Every
 * item is read from records — nothing here is estimated or filled in.
 */
export type BoardLane = "requests" | "proposed" | "confirmed" | "exceptions" | "approvals";

export type ExceptionKind = "emergency" | "stale" | "duplicate" | "failed_message" | "alert_setup" | "takeover" | "unconfirmed_soon";

export type BoardItem = {
  id: string;
  lane: BoardLane;
  title: string;
  detail: string;
  at: string;
  leadId?: string | null;
  jobId?: string | null;
  phone?: string | null;
  urgent?: boolean;
  takenOver?: boolean;
  exception?: ExceptionKind;
  /** For proposed jobs: where the confirmation text stands. */
  confirm?: "not_sent" | "sent" | "failed" | "confirmed";
  proposalId?: string;
  preview?: string;
};

export type CommandBoard = {
  generatedAt: string;
  environment: string;
  lanes: Record<BoardLane, BoardItem[]>;
};

const OPEN_JOB = ["scheduled", "confirmed", "en_route", "on_site"];
const DAY = 24 * 60 * 60_000;
const DECISIONS = ["lead.escalated", "lead.held", "lead.follow_up", "lead.answered", "service_area.checked", "owner.alert_skipped"];

function who(name: string | null | undefined, phone: string | null | undefined) {
  return name?.trim() || phone || "Unknown caller";
}

export async function buildCommandBoard(businessId: string, now = new Date()): Promise<CommandBoard> {
  const since = new Date(now.getTime() - 14 * DAY);
  const recent = new Date(now.getTime() - 2 * DAY);
  const week = new Date(now.getTime() + 7 * DAY);

  const [shop, leads, jobs, proposals, failedAlerts, failedTexts, smsFailures, takeovers, escalations] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { timezone: true, environment: true } }),
    prisma.lead.findMany({
      where: {
        businessId,
        status: { in: ["new", "contacted"] },
        job: { is: null },
        createdAt: { gte: since },
        OR: [{ categoryCode: null }, { categoryCode: { not: "other.non_service" } }],
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, name: true, phone: true, serviceType: true, urgency: true, address: true, status: true, source: true, createdAt: true },
    }),
    prisma.job.findMany({
      where: {
        businessId,
        status: { in: OPEN_JOB },
        OR: [{ scheduledAt: { gte: new Date(now.getTime() - 2 * DAY), lte: week } }, { scheduledAt: null }],
      },
      orderBy: { scheduledAt: "asc" },
      take: 80,
      select: {
        id: true,
        businessId: true,
        leadId: true,
        customerId: true,
        title: true,
        serviceType: true,
        status: true,
        urgency: true,
        scheduledAt: true,
        createdAt: true,
        customerConfirmedAt: true,
        customerConfirmSentAt: true,
        customerConfirmFailedAt: true,
        technician: { select: { name: true } },
        customer: { select: { name: true, phone: true } },
        lead: { select: { name: true, phone: true } },
        _count: { select: { deposits: true, invoices: true } },
      },
    }),
    prisma.copilotAction.findMany({
      where: { businessId, status: "proposed" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.ownerNotification.findMany({
      where: { businessId, status: "failed", createdAt: { gte: recent } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, channel: true, error: true, leadId: true, createdAt: true },
    }),
    prisma.message.findMany({
      where: { businessId, direction: "out", deliveryStatus: { in: ["failed", "undelivered"] }, createdAt: { gte: recent } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, phoneNormalized: true, body: true, createdAt: true },
    }),
    prisma.auditEvent.findMany({
      where: { businessId, action: "sms.failed", createdAt: { gte: recent } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, summary: true, entityId: true, leadId: true, jobId: true, createdAt: true },
    }),
    prisma.takeover.findMany({ where: { businessId, releasedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.auditEvent.findMany({
      where: { businessId, action: "lead.escalated", createdAt: { gte: recent } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, summary: true, leadId: true, createdAt: true },
    }),
  ]);

  const tz = shop.timezone ?? "America/New_York";
  const when = (at: Date) => formatShopTime(at, tz);
  const takenPhones = new Set(takeovers.map((t) => t.phoneNormalized));
  const phoneKey = (p: string | null | undefined) => (p ? p.replace(/[^\d+]/g, "") : "");

  const leadIds = leads.map((l) => l.id);
  const decisions = leadIds.length
    ? await prisma.auditEvent.findMany({
        where: { businessId, leadId: { in: leadIds }, action: { in: DECISIONS } },
        orderBy: { createdAt: "desc" },
        select: { leadId: true, summary: true, action: true },
      })
    : [];
  const reasonFor = new Map<string, string>();
  for (const d of decisions) {
    if (!d.leadId || reasonFor.has(d.leadId)) continue;
    if (d.action === "service_area.checked" && !d.summary.startsWith("Outside")) continue;
    reasonFor.set(d.leadId, d.summary);
  }

  const requests: BoardItem[] = leads.map((lead) => ({
    id: `lead:${lead.id}`,
    lane: "requests",
    title: `${who(lead.name, lead.phone)} · ${lead.serviceType ?? "needs review"}`,
    detail:
      reasonFor.get(lead.id) ??
      (lead.address ? `Waiting on a time — ${lead.address}` : "Waiting on details — no address yet"),
    at: lead.createdAt.toISOString(),
    leadId: lead.id,
    phone: lead.phone,
    urgent: lead.urgency === "emergency",
    takenOver: takenPhones.has(phoneKey(lead.phone)),
  }));

  const proposed: BoardItem[] = [];
  const confirmed: BoardItem[] = [];
  const exceptions: BoardItem[] = [];

  for (const job of jobs) {
    const person = who(job.customer?.name ?? job.lead?.name, job.customer?.phone ?? job.lead?.phone);
    const phone = job.customer?.phone ?? job.lead?.phone ?? null;
    const slot = job.scheduledAt ? when(job.scheduledAt) : "no time set";
    const crew = job.technician ? job.technician.name : "no technician yet";
    const base = {
      leadId: job.leadId,
      jobId: job.id,
      phone,
      urgent: job.urgency === "emergency",
      takenOver: takenPhones.has(phoneKey(phone)),
    };
    const isConfirmed = Boolean(job.customerConfirmedAt) || job.status === "confirmed";
    const started = job.status === "en_route" || job.status === "on_site";

    if (job.scheduledAt && !started && job.scheduledAt.getTime() < now.getTime() - 30 * 60_000) {
      exceptions.push({
        ...base,
        id: `stale:${job.id}`,
        lane: "exceptions",
        exception: "stale",
        title: `${person} · ${job.title}`,
        detail: `Window was ${slot} and nobody is on the way — move it or close it.`,
        at: job.createdAt.toISOString(),
      });
      continue;
    }
    if (started) continue;

    if (isConfirmed) {
      confirmed.push({
        ...base,
        id: `job:${job.id}`,
        lane: "confirmed",
        title: `${person} · ${job.title}`,
        detail: `${slot} · ${crew}`,
        at: job.createdAt.toISOString(),
        confirm: "confirmed",
      });
      continue;
    }

    const confirm: BoardItem["confirm"] = job.customerConfirmFailedAt
      ? "failed"
      : job.customerConfirmSentAt
        ? "sent"
        : "not_sent";
    proposed.push({
      ...base,
      id: `job:${job.id}`,
      lane: "proposed",
      title: `${person} · ${job.title}`,
      detail: `${slot} · ${crew} · ${
        confirm === "sent" ? "confirm text sent, waiting on the customer" : confirm === "failed" ? "confirm text failed — call them" : "confirm text not sent yet"
      }`,
      at: job.createdAt.toISOString(),
      confirm,
    });
    if (confirm === "failed") {
      exceptions.push({
        ...base,
        id: `confirm-failed:${job.id}`,
        lane: "exceptions",
        exception: "failed_message",
        title: `${person} · confirmation text failed`,
        detail: `The text for ${slot} did not go through. Call ${phone ?? "them"} to confirm.`,
        at: (job.customerConfirmFailedAt ?? job.createdAt).toISOString(),
      });
    } else if (job.scheduledAt && job.scheduledAt.getTime() - now.getTime() < 2 * 60 * 60_000) {
      exceptions.push({
        ...base,
        id: `unconfirmed:${job.id}`,
        lane: "exceptions",
        exception: "unconfirmed_soon",
        title: `${person} · starts soon, not confirmed`,
        detail: `${slot} — the customer has not confirmed. Call before the tech rolls.`,
        at: job.createdAt.toISOString(),
      });
    }
  }

  const duplicates = findDuplicateJobs(
    jobs.map((j) => ({
      id: j.id,
      businessId: j.businessId,
      customerId: j.customerId,
      serviceType: j.serviceType,
      title: j.title,
      status: j.status,
      createdAt: j.createdAt,
      hasMoney: j._count.deposits + j._count.invoices > 0,
    })),
  );
  for (const pair of duplicates) {
    const dup = jobs.find((j) => j.id === pair.drop)!;
    const person = who(dup.customer?.name ?? dup.lead?.name, dup.customer?.phone ?? dup.lead?.phone);
    exceptions.push({
      id: `duplicate:${dup.id}`,
      lane: "exceptions",
      exception: "duplicate",
      title: `${person} · possible duplicate job`,
      detail: `Same customer and service as another open job opened within a day. Cancel one.`,
      at: dup.createdAt.toISOString(),
      jobId: dup.id,
      leadId: dup.leadId,
    });
  }

  const openLeadIds = new Set(leadIds);
  for (const e of escalations) {
    if (!e.leadId || !openLeadIds.has(e.leadId)) continue;
    const lead = leads.find((l) => l.id === e.leadId)!;
    exceptions.push({
      id: `emergency:${e.id}`,
      lane: "exceptions",
      exception: "emergency",
      title: `${who(lead.name, lead.phone)} · safety call`,
      detail: e.summary,
      at: e.createdAt.toISOString(),
      leadId: lead.id,
      phone: lead.phone,
      urgent: true,
      takenOver: takenPhones.has(phoneKey(lead.phone)),
    });
  }

  if (failedAlerts.length) {
    const reasons = new Map<string, string>();
    for (const n of failedAlerts) {
      const channel = n.channel === "sms" ? "Text" : "Email";
      if (!reasons.has(channel)) reasons.set(channel, n.error ?? "delivery failed");
    }
    exceptions.push({
      id: `alert-setup:${failedAlerts[0]!.id}`,
      lane: "exceptions",
      exception: "alert_setup",
      title: "Your alerts aren't reaching you",
      detail: `${failedAlerts.length} failed in the last 2 days · ${[...reasons].map(([c, why]) => `${c}: ${why}`).join(" · ")}`,
      at: failedAlerts[0]!.createdAt.toISOString(),
    });
  }
  for (const m of failedTexts) {
    exceptions.push({
      id: `text-failed:${m.id}`,
      lane: "exceptions",
      exception: "failed_message",
      title: `Text to ${m.phoneNormalized} was not delivered`,
      detail: m.body.slice(0, 120),
      at: m.createdAt.toISOString(),
      phone: m.phoneNormalized,
    });
  }
  for (const a of smsFailures) {
    if (exceptions.some((x) => x.exception === "failed_message" && x.phone && phoneKey(x.phone) === a.entityId)) continue;
    exceptions.push({
      id: `sms-failed:${a.id}`,
      lane: "exceptions",
      exception: "failed_message",
      title: "Text did not send",
      detail: a.summary,
      at: a.createdAt.toISOString(),
      leadId: a.leadId,
      jobId: a.jobId,
    });
  }
  for (const t of takeovers) {
    exceptions.push({
      id: `takeover:${t.id}`,
      lane: "exceptions",
      exception: "takeover",
      title: `${t.takenBy} is handling ${t.phoneNormalized}`,
      detail: "Orvius is holding automated texts to this customer until it's handed back.",
      at: t.createdAt.toISOString(),
      leadId: t.leadId,
      phone: t.phoneNormalized,
      takenOver: true,
    });
  }

  const order: Record<ExceptionKind, number> = { emergency: 0, alert_setup: 1, failed_message: 2, unconfirmed_soon: 3, stale: 4, duplicate: 5, takeover: 6 };
  exceptions.sort((a, b) => order[a.exception!] - order[b.exception!] || b.at.localeCompare(a.at));
  requests.sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) || b.at.localeCompare(a.at));

  const approvals: BoardItem[] = proposals.map((p) => {
    const params = JSON.parse(p.paramsJson) as { leadId?: string; jobId?: string };
    return {
      id: `approval:${p.id}`,
      lane: "approvals",
      title: p.preview.split("\n")[0] ?? p.preview,
      detail: p.action.replace(/_/g, " "),
      preview: p.preview,
      at: p.createdAt.toISOString(),
      proposalId: p.id,
      leadId: params.leadId ?? null,
      jobId: params.jobId ?? null,
    };
  });

  return {
    generatedAt: now.toISOString(),
    environment: shop.environment,
    lanes: { requests, proposed, confirmed, exceptions, approvals },
  };
}
