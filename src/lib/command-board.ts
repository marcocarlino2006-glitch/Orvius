import { formatShopTime } from "@/lib/availability";
import { formatCentsExact } from "@/lib/money";
import { needsCheck, STALE_EXECUTING_MS } from "@/lib/copilot-execute";
import { prisma } from "@/lib/prisma";
import { findDuplicateJobs } from "@/lib/workspace-hygiene";

/**
 * Command's daily board: everything that came in, what Orvius proposed, what
 * the customer locked in, what broke, and what waits on the owner. Every
 * item is read from records — nothing here is estimated or filled in.
 */
export type BoardLane = "requests" | "proposed" | "confirmed" | "exceptions" | "approvals";

export type ExceptionKind =
  | "emergency"
  | "stale"
  | "duplicate"
  | "failed_message"
  | "alert_setup"
  | "takeover"
  | "unconfirmed_soon"
  | "tech_declined"
  | "tech_unanswered"
  | "record_mismatch"
  | "billing_gap"
  | "invoice_undelivered";

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
  techPhone?: string | null;
  exception?: ExceptionKind;
  /** For proposed jobs: where the confirmation text stands. */
  confirm?: "not_sent" | "sent" | "failed" | "confirmed";
  proposalId?: string;
  preview?: string;
  /** An approval that ran but whose outcome Orvius can't vouch for; a person says whether it happened. */
  needsCheck?: "unknown" | "done_unrecorded";
  /** An open reconciliation exception a person resolves, with what they did. */
  reconcileId?: string;
  /** For a disagreement with another system: which one holds the record, and where the shop opens it. */
  systemOfRecord?: string;
  providerHref?: string | null;
};

export type CommandBoard = {
  generatedAt: string;
  environment: string;
  lanes: Record<BoardLane, BoardItem[]>;
};

const OPEN_JOB = ["scheduled", "confirmed", "en_route", "on_site"];
const DAY = 24 * 60 * 60_000;
const DECISIONS = ["lead.escalated", "lead.held", "lead.follow_up", "lead.answered", "service_area.checked", "owner.alert_skipped"];

/* A job text Twilio hasn't taken a couple of minutes after assigning did not go out. */
const NOTIFY_GRACE_MS = 2 * 60_000;
/* An unanswered assignment becomes the owner's problem this long after it was made, or this close to the visit. */
const ANSWER_WAIT_MS = 2 * 60 * 60_000;
const ANSWER_LEAD_MS = 4 * 60 * 60_000;

type CrewFacts = {
  scheduledAt: Date | null;
  technician: { name: string; phone?: string | null } | null;
  techAssignedAt: Date | null;
  techNotifiedAt: Date | null;
  techAcceptedAt: Date | null;
  techDeclinedAt: Date | null;
  techDeclinedBy: string | null;
  techDeclineReason: string | null;
};

/**
 * Whether the technician side of a booked job needs the owner: someone said
 * they can't take it, the job text never went out, or nobody has answered
 * and the visit is getting close. Jobs assigned before technicians could
 * answer carry no assignment time and are left alone.
 */
export function techIssue(job: CrewFacts, now = new Date()): { kind: "tech_declined" | "tech_unanswered"; title: string; detail: string; at: Date } | null {
  if (!job.technician) {
    if (!job.techDeclinedAt) return null;
    const by = job.techDeclinedBy ?? "The technician";
    return {
      kind: "tech_declined",
      title: `${by} can't take it`,
      detail: `${job.techDeclineReason ? `"${job.techDeclineReason}" · ` : ""}nobody is on it now, assign someone else`,
      at: job.techDeclinedAt,
    };
  }
  if (job.techAcceptedAt || !job.techAssignedAt) return null;
  const name = job.technician.name;
  const hasNumber = Boolean(job.technician.phone?.trim());
  if (!job.techNotifiedAt && now.getTime() - job.techAssignedAt.getTime() > NOTIFY_GRACE_MS) {
    return hasNumber
      ? { kind: "tech_unanswered", title: `${name} wasn't told`, detail: `the job text to ${name} didn't go out, call them`, at: job.techAssignedAt }
      : { kind: "tech_unanswered", title: `${name} has no number`, detail: `the job text can't go out — add ${name}'s mobile number in Team`, at: job.techAssignedAt };
  }
  const waited = now.getTime() - job.techAssignedAt.getTime() > ANSWER_WAIT_MS;
  const close = job.scheduledAt != null && job.scheduledAt.getTime() - now.getTime() < ANSWER_LEAD_MS;
  if (!waited && !close) return null;
  return hasNumber
    ? { kind: "tech_unanswered", title: `${name} hasn't accepted`, detail: `call ${name} to make sure they're going`, at: job.techAssignedAt }
    : { kind: "tech_unanswered", title: `${name} has no number`, detail: `${name} can't answer without the job text — add their mobile number in Team`, at: job.techAssignedAt };
}

function who(name: string | null | undefined, phone: string | null | undefined) {
  return name?.trim() || phone || "Unknown caller";
}

export async function buildCommandBoard(businessId: string, now = new Date()): Promise<CommandBoard> {
  const since = new Date(now.getTime() - 14 * DAY);
  const recent = new Date(now.getTime() - 2 * DAY);
  const week = new Date(now.getTime() + 7 * DAY);

  const [shop, leads, jobs, proposals, failedAlerts, failedTexts, smsFailures, takeovers, escalations, mismatches] = await Promise.all([
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
        techAssignedAt: true,
        techNotifiedAt: true,
        techAcceptedAt: true,
        techDeclinedAt: true,
        techDeclinedBy: true,
        techDeclineReason: true,
        technician: { select: { name: true, phone: true } },
        customer: { select: { name: true, phone: true } },
        lead: { select: { name: true, phone: true } },
        _count: { select: { deposits: true, invoices: true } },
      },
    }),
    prisma.copilotAction.findMany({
      where: {
        businessId,
        OR: [
          { status: { in: ["proposed", "reconcile"] } },
          { status: "executing", createdAt: { lt: new Date(now.getTime() - STALE_EXECUTING_MS) } },
        ],
      },
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
      select: { id: true, sid: true, phoneNormalized: true, body: true, createdAt: true },
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
    prisma.reconciliationException.findMany({
      where: { businessId, status: "open" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, kind: true, entityType: true, entityId: true, system: true, expectedJson: true, observedJson: true, createdAt: true },
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
      techPhone: job.technician?.phone ?? null,
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

    const crewIssue = techIssue(job, now);
    if (crewIssue) {
      exceptions.push({
        ...base,
        id: `${crewIssue.kind}:${job.id}`,
        lane: "exceptions",
        exception: crewIssue.kind,
        title: `${person} · ${crewIssue.title}`,
        detail: `${slot} · ${crewIssue.detail}`,
        at: crewIssue.at.toISOString(),
      });
    }

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
  const onBoard = new Set(
    [...requests, ...proposed, ...confirmed, ...exceptions].map((item) => phoneKey(item.phone)).filter(Boolean),
  );
  const nameFor = new Map<string, string>();
  for (const lead of leads) if (lead.name) nameFor.set(phoneKey(lead.phone), lead.name);
  for (const job of jobs) {
    const name = job.customer?.name ?? job.lead?.name;
    const phone = phoneKey(job.customer?.phone ?? job.lead?.phone);
    if (name && phone && !nameFor.has(phone)) nameFor.set(phone, name);
  }
  for (const t of takeovers) {
    /* The person's own card already carries "You have it". */
    if (onBoard.has(t.phoneNormalized)) continue;
    exceptions.push({
      id: `takeover:${t.id}`,
      lane: "exceptions",
      exception: "takeover",
      title: `${who(nameFor.get(t.phoneNormalized) ?? null, t.phoneNormalized)} · texts paused`,
      detail: `${t.takenBy} took over this conversation. Orvius holds automated texts until it's handed back.`,
      at: t.createdAt.toISOString(),
      leadId: t.leadId,
      phone: t.phoneNormalized,
      takenOver: true,
    });
  }

  exceptions.push(...(await mismatchItems(businessId, mismatches)));
  const billing = await billingItems(businessId, now);
  /* A bill text that failed is one problem: the bill item says which bill, so the generic text item for it goes. */
  const covered = new Set([
    ...failedTexts.filter((m) => m.sid && billing.sids.has(m.sid)).map((m) => `text-failed:${m.id}`),
    ...smsFailures
      .filter((a) => billing.attempts.some((t) => t.to === a.entityId && a.createdAt >= t.from && a.createdAt.getTime() <= t.until.getTime() + 60_000))
      .map((a) => `sms-failed:${a.id}`),
  ]);
  for (let i = exceptions.length - 1; i >= 0; i--) if (covered.has(exceptions[i]!.id)) exceptions.splice(i, 1);
  exceptions.push(...billing.items);

  const order: Record<ExceptionKind, number> = {
    emergency: 0,
    alert_setup: 1,
    tech_declined: 2,
    record_mismatch: 3,
    failed_message: 4,
    invoice_undelivered: 5,
    billing_gap: 6,
    tech_unanswered: 7,
    unconfirmed_soon: 8,
    stale: 9,
    duplicate: 10,
    takeover: 11,
  };
  exceptions.sort((a, b) => order[a.exception!] - order[b.exception!] || b.at.localeCompare(a.at));
  requests.sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)) || b.at.localeCompare(a.at));

  const approvals: BoardItem[] = proposals.flatMap((p) => {
    if (p.status !== "proposed" && !needsCheck(p, now)) return [];
    let params: { leadId?: string; jobId?: string } = {};
    let result: { done?: boolean } | null = null;
    try {
      params = JSON.parse(p.paramsJson);
      result = p.resultJson ? JSON.parse(p.resultJson) : null;
    } catch {}
    const check = p.status === "proposed" ? undefined : result?.done ? "done_unrecorded" : "unknown";
    return [{
      id: `approval:${p.id}`,
      lane: "approvals" as const,
      title: p.preview.split("\n")[0] ?? p.preview,
      detail: check === "done_unrecorded"
        ? "This went through but Orvius couldn't save the record. Confirm it so the history is right."
        : check === "unknown"
          ? "This stopped partway, so part of it may have happened. Check the job or request, then say whether it did."
          : p.action.replace(/_/g, " "),
      preview: p.preview,
      at: p.createdAt.toISOString(),
      proposalId: p.id,
      leadId: params.leadId ?? null,
      jobId: params.jobId ?? null,
      ...(check ? { needsCheck: check } : {}),
    }];
  });

  return {
    generatedAt: now.toISOString(),
    environment: shop.environment,
    lanes: { requests, proposed, confirmed, exceptions, approvals },
  };
}

type Mismatch = { id: string; kind: string; entityType: string; entityId: string; system: string; expectedJson: string; observedJson: string; createdAt: Date };

function parsed(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const cents = (v: unknown) => (typeof v === "number" ? formatCentsExact(v) : "an amount");
const SYSTEM_NAMES: Record<string, string> = { stripe: "Stripe", vapi: "the voice provider", orvius: "Orvius", jobber: "Jobber", housecall: "Housecall Pro", servicetitan: "ServiceTitan", quickbooks: "QuickBooks" };

/** What a person reads for one open reconciliation exception, and what to do about it. */
export function mismatchText(row: Pick<Mismatch, "kind" | "entityType" | "system" | "expectedJson" | "observedJson">): { title: string; detail: string } {
  const expected = parsed(row.expectedJson);
  const observed = parsed(row.observedJson);
  if (row.kind === "payment" && observed.reason === "late_session_payment") {
    return {
      title: `Extra payment on a settled ${row.entityType}`,
      detail: `A customer paid ${cents(observed.amountCents)} after the ${row.entityType} was already settled. Nothing was refunded. Refund it in Stripe or tell them it's credited, then mark it resolved.`,
    };
  }
  if (observed.reason === "response_lost" || observed.reason === "local_finalize_failed") {
    const provider = SYSTEM_NAMES[row.system] ?? row.system;
    const what = typeof expected.effect === "string" ? expected.effect : "change";
    return observed.reason === "response_lost"
      ? {
          title: `No reply from ${provider} on a ${what}`,
          detail: `Orvius asked ${provider} for a ${what} and the answer never came back, so it may or may not exist. It won't be repeated blindly: the next try checks ${provider} first. Check ${provider}, then mark it resolved with what you found.`,
        }
      : {
          title: `${provider} did a ${what} Orvius didn't save`,
          detail: `${provider} accepted it (${String(observed.providerId ?? "id on file")}) but Orvius couldn't record it. The next try saves it without asking ${provider} again. If this stays open, check the ${row.entityType} and mark it resolved.`,
        };
  }
  if (row.kind === "payment" && (observed.reason === "refund_unmatched" || observed.reason === "refund_record_missing")) {
    const charge = typeof observed.chargeId === "string" ? observed.chargeId : "a charge";
    return observed.reason === "refund_unmatched"
      ? {
          title: `Stripe refund not matched to a payment`,
          detail: `Stripe (the record for card money) refunded ${cents(observed.amountCents)} on ${charge}. This bill has more than one card payment and Orvius can't tell which was refunded, so its payments still read as collected. Find the charge in Stripe, mark that payment refunded on the job, then mark this resolved.`,
        }
      : {
          title: `Stripe refund for a missing ${row.entityType}`,
          detail: `Stripe (the record for card money) refunded ${cents(observed.amountCents)} on ${charge}, but the ${row.entityType} it was for isn't in Orvius any more. Nothing changed here. Check the refund in Stripe, then mark this resolved with what you found.`,
        };
  }
  if (row.kind === "change" && row.entityType === "invoice") {
    const basis = expected.basis === "signed_estimate" ? "signed" : expected.basis === "paid_toward" ? "already paid toward" : "sent";
    return {
      title: "Bill total changed after the customer had it",
      detail: `The customer's ${basis} bill stays at ${cents(expected.amountCents)}. A new total of ${cents(observed.amountCents)} came in. Change the bill with a reason, or mark this resolved to keep it.`,
    };
  }
  const system = SYSTEM_NAMES[row.system] ?? row.system;
  return {
    title: `${system} and Orvius disagree on a ${row.entityType}`,
    detail: `Orvius couldn't confirm a ${row.kind} on this ${row.entityType} in ${system}. Check it there, then mark it resolved with what you found.`,
  };
}

async function mismatchItems(businessId: string, rows: Mismatch[]): Promise<BoardItem[]> {
  if (!rows.length) return [];
  const ids = (type: string) => rows.filter((r) => r.entityType === type).map((r) => r.entityId);
  const [invoices, deposits, jobs] = await Promise.all([
    prisma.invoice.findMany({ where: { businessId, id: { in: ids("invoice") } }, select: { id: true, jobId: true } }),
    prisma.deposit.findMany({ where: { businessId, id: { in: ids("deposit") } }, select: { id: true, jobId: true, leadId: true } }),
    prisma.job.findMany({ where: { businessId, id: { in: ids("job") } }, select: { id: true } }),
  ]);
  const jobFor = new Map<string, string | null>([
    ...invoices.map((i) => [`invoice:${i.id}`, i.jobId] as const),
    ...deposits.map((d) => [`deposit:${d.id}`, d.jobId] as const),
    ...jobs.map((j) => [`job:${j.id}`, j.id] as const),
  ]);
  const leadFor = new Map(deposits.map((d) => [`deposit:${d.id}`, d.leadId]));
  return rows.map((row) => ({
    id: `reconcile:${row.id}`,
    lane: "exceptions" as const,
    exception: "record_mismatch" as const,
    ...mismatchText(row),
    at: row.createdAt.toISOString(),
    jobId: jobFor.get(`${row.entityType}:${row.entityId}`) ?? null,
    leadId: leadFor.get(`${row.entityType}:${row.entityId}`) ?? null,
    reconcileId: row.id,
    systemOfRecord: SYSTEM_NAMES[row.system] ?? row.system,
    providerHref: row.system === "orvius" ? null : "/dashboard/settings?settings=integrations",
  }));
}

const BILL_TEXT_FAILED = ["undelivered", "rejected", "retry_exhausted", "unknown_submission"];

/**
 * Money the shop earned that hasn't reached the customer: work marked done
 * with a total and no bill, and bills whose latest pay-link text failed or
 * may not have gone out. Both are read from the job, the invoice and the text
 * ledger, so they stay on the board through a reload until the record changes.
 */
async function billingItems(businessId: string, now: Date): Promise<{ items: BoardItem[]; sids: Set<string>; attempts: { to: string; from: Date; until: Date }[] }> {
  const month = new Date(now.getTime() - 30 * DAY);
  const [unbilled, intents] = await Promise.all([
    prisma.job.findMany({
      where: { businessId, status: "completed", completedAt: { gte: month }, finalAmountCents: { gt: 0 }, invoices: { none: {} } },
      orderBy: { completedAt: "desc" },
      take: 20,
      select: { id: true, leadId: true, title: true, finalAmountCents: true, completedAt: true, customer: { select: { name: true, phone: true } }, lead: { select: { name: true, phone: true } } },
    }),
    prisma.smsIntent.findMany({
      where: { businessId, eventType: "invoice.pay_link", updatedAt: { gte: month } },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: { eventId: true, status: true, updatedAt: true, createdAt: true, providerSid: true, recipientNormalized: true },
    }),
  ]);
  /* Versions count per recipient, so a bill's latest attempt is the newest one, whichever number it went to. */
  const latest = new Map<string, { status: string; updatedAt: Date; createdAt: Date; providerSid: string | null; recipientNormalized: string }>();
  for (const i of intents) if ((latest.get(i.eventId)?.createdAt.getTime() ?? -1) < i.createdAt.getTime()) latest.set(i.eventId, i);
  const failedIds = [...latest].filter(([, i]) => BILL_TEXT_FAILED.includes(i.status)).map(([id]) => id);
  const bills = failedIds.length
    ? await prisma.invoice.findMany({
        where: { businessId, id: { in: failedIds }, paidAt: null, status: { notIn: ["paid", "void", "refunded"] } },
        select: { id: true, amountCents: true, jobId: true, job: { select: { leadId: true, title: true, customer: { select: { name: true, phone: true } }, lead: { select: { name: true, phone: true } } } } },
      })
    : [];
  const sids = new Set(bills.map((b) => latest.get(b.id)!.providerSid).filter((sid): sid is string => Boolean(sid)));
  const attempts = bills.map((b) => latest.get(b.id)!).map((t) => ({ to: t.recipientNormalized, from: t.createdAt, until: t.updatedAt }));
  const items = [
    ...unbilled.map((job) => ({
      id: `billing-gap:${job.id}`,
      lane: "exceptions" as const,
      exception: "billing_gap" as const,
      title: `${who(job.customer?.name ?? job.lead?.name, job.customer?.phone ?? job.lead?.phone)} · done, not billed`,
      detail: `Marked done with a ${formatCentsExact(job.finalAmountCents!)} total, but no bill was created. Create and send it from the job.`,
      at: (job.completedAt ?? now).toISOString(),
      jobId: job.id,
      leadId: job.leadId,
      phone: job.customer?.phone ?? job.lead?.phone ?? null,
    })),
    ...bills.map((bill) => {
      const intent = latest.get(bill.id)!;
      const unknown = intent.status === "unknown_submission";
      const person = who(bill.job?.customer?.name ?? bill.job?.lead?.name, bill.job?.customer?.phone ?? bill.job?.lead?.phone);
      return {
        id: `invoice-undelivered:${bill.id}`,
        lane: "exceptions" as const,
        exception: "invoice_undelivered" as const,
        title: unknown ? `${person} · bill text may not have gone out` : `${person} · bill text didn't reach them`,
        detail: unknown
          ? `The ${formatCentsExact(bill.amountCents)} pay link may or may not have been sent, so Orvius won't resend it on its own. Ask ${person} before resending.`
          : `The ${formatCentsExact(bill.amountCents)} pay link didn't go through. Call ${person}, or fix the number and resend it.`,
        at: intent.updatedAt.toISOString(),
        jobId: bill.jobId,
        leadId: bill.job?.leadId ?? null,
        phone: bill.job?.customer?.phone ?? bill.job?.lead?.phone ?? null,
      };
    }),
  ];
  return { items, sids, attempts };
}
