import { listAuditFor } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { leadNextAction } from "@/lib/lead-next-action";
import { telHref } from "@/lib/demo-line";
import { formatCents } from "@/lib/money";
import { jobStatusLabel, nextJobStatus } from "@/lib/job-status";
import {
  recordHref,
  type PathNode,
  type RecordEvent,
  type RecordType,
  type RecordView,
} from "@/lib/record-types";

/**
 * One connected view of any record: Call → Lead → Customer → Property → Job →
 * Technician → Estimate → Invoice → Payment. Every field is read from a row or
 * a timestamp that proves it; a missing step is shown as missing, not guessed.
 */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

type Graph = {
  call: {
    id: string;
    callerPhone: string | null;
    status: string;
    durationSec: number | null;
    summary: string | null;
    transcript: string | null;
    ownerNotifiedAt: Date | null;
    createdAt: Date;
  } | null;
  lead: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    serviceType: string | null;
    urgency: string | null;
    address: string | null;
    notes: string | null;
    status: string;
    source: string;
    firstContactedAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
  } | null;
  customer: {
    id: string;
    name: string | null;
    phone: string;
    email: string | null;
    address: string | null;
    interactionCount: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
  } | null;
  job: {
    id: string;
    title: string;
    status: string;
    serviceType: string | null;
    urgency: string | null;
    address: string | null;
    scheduledAt: Date | null;
    customerConfirmSentAt: Date | null;
    customerConfirmedAt: Date | null;
    dispatchedAt: Date | null;
    onSiteAt: Date | null;
    completedAt: Date | null;
    finalAmountCents: number | null;
    createdAt: Date;
    technician: { id: string; name: string } | null;
  } | null;
  estimate: { id: string; amountCents: number; status: string; sentAt: Date | null; acceptedAt: Date | null } | null;
  invoice: { id: string; amountCents: number; status: string; createdAt: Date } | null;
  paidCents: number;
  lastPaymentAt: Date | null;
};

const CALL_SELECT = {
  id: true,
  callerPhone: true,
  status: true,
  durationSec: true,
  summary: true,
  transcript: true,
  ownerNotifiedAt: true,
  createdAt: true,
} as const;

const LEAD_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  serviceType: true,
  urgency: true,
  address: true,
  notes: true,
  status: true,
  source: true,
  firstContactedAt: true,
  closedAt: true,
  createdAt: true,
} as const;

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  interactionCount: true,
  firstSeenAt: true,
  lastSeenAt: true,
} as const;

const JOB_SELECT = {
  id: true,
  title: true,
  status: true,
  serviceType: true,
  urgency: true,
  address: true,
  scheduledAt: true,
  customerConfirmSentAt: true,
  customerConfirmedAt: true,
  dispatchedAt: true,
  onSiteAt: true,
  completedAt: true,
  finalAmountCents: true,
  createdAt: true,
  technician: { select: { id: true, name: true } },
} as const;

async function moneyForJob(businessId: string, jobId: string) {
  const [estimate, invoice] = await Promise.all([
    prisma.estimate.findFirst({
      where: { businessId, jobId },
      select: { id: true, amountCents: true, status: true, sentAt: true, acceptedAt: true },
    }),
    prisma.invoice.findFirst({
      where: { businessId, jobId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amountCents: true,
        status: true,
        createdAt: true,
        payments: { select: { amountCents: true, createdAt: true } },
      },
    }),
  ]);
  const payments = invoice?.payments ?? [];
  return {
    estimate,
    invoice: invoice
      ? { id: invoice.id, amountCents: invoice.amountCents, status: invoice.status, createdAt: invoice.createdAt }
      : null,
    paidCents: payments.reduce((sum, p) => sum + p.amountCents, 0),
    lastPaymentAt: payments.reduce<Date | null>(
      (latest, p) => (!latest || p.createdAt > latest ? p.createdAt : latest),
      null,
    ),
  };
}

async function resolveGraph(
  businessId: string,
  type: RecordType,
  id: string,
): Promise<Graph | null> {
  let call: Graph["call"] = null;
  let lead: Graph["lead"] = null;
  let customer: Graph["customer"] = null;
  let job: Graph["job"] = null;

  if (type === "call") {
    const row = await prisma.call.findFirst({
      where: { id, businessId },
      select: {
        ...CALL_SELECT,
        customer: { select: CUSTOMER_SELECT },
        lead: { select: { ...LEAD_SELECT, job: { select: JOB_SELECT } } },
      },
    });
    if (!row) return null;
    const { customer: c, lead: l, ...rest } = row;
    call = rest;
    customer = c;
    if (l) {
      const { job: j, ...leadRest } = l;
      lead = leadRest;
      job = j;
    }
  } else if (type === "lead") {
    const row = await prisma.lead.findFirst({
      where: { id, businessId },
      select: {
        ...LEAD_SELECT,
        call: { select: CALL_SELECT },
        customer: { select: CUSTOMER_SELECT },
        job: { select: JOB_SELECT },
      },
    });
    if (!row) return null;
    const { call: c, customer: cu, job: j, ...rest } = row;
    lead = rest;
    call = c;
    customer = cu;
    job = j;
  } else if (type === "job") {
    const row = await prisma.job.findFirst({
      where: { id, businessId },
      select: {
        ...JOB_SELECT,
        customer: { select: CUSTOMER_SELECT },
        lead: { select: { ...LEAD_SELECT, call: { select: CALL_SELECT } } },
      },
    });
    if (!row) return null;
    const { customer: cu, lead: l, ...rest } = row;
    job = rest;
    customer = cu;
    if (l) {
      const { call: c, ...leadRest } = l;
      lead = leadRest;
      call = c;
    }
  } else {
    const row = await prisma.customer.findFirst({
      where: { id, businessId },
      select: CUSTOMER_SELECT,
    });
    if (!row) return null;
    customer = row;
    const [latestJob, latestLead] = await Promise.all([
      prisma.job.findFirst({
        where: { businessId, customerId: row.id },
        orderBy: { createdAt: "desc" },
        select: JOB_SELECT,
      }),
      prisma.lead.findFirst({
        where: { businessId, customerId: row.id },
        orderBy: { createdAt: "desc" },
        select: { ...LEAD_SELECT, call: { select: CALL_SELECT } },
      }),
    ]);
    job = latestJob;
    if (latestLead) {
      const { call: c, ...leadRest } = latestLead;
      lead = leadRest;
      call = c;
    }
  }

  const money = job
    ? await moneyForJob(businessId, job.id)
    : { estimate: null, invoice: null, paidCents: 0, lastPaymentAt: null };

  return { call, lead, customer, job, ...money };
}

function buildPath(g: Graph): PathNode[] {
  const property = g.job?.address ?? g.lead?.address ?? g.customer?.address ?? null;
  return [
    {
      type: "call",
      label: "Call",
      value: g.call ? (g.call.summary ? "Answered" : g.call.status) : null,
      recordType: g.call ? "call" : undefined,
      recordId: g.call?.id,
    },
    {
      type: "lead",
      label: "Lead",
      value: g.lead ? (g.lead.serviceType ?? g.lead.status) : null,
      recordType: g.lead ? "lead" : undefined,
      recordId: g.lead?.id,
    },
    {
      type: "customer",
      label: "Customer",
      value: g.customer ? (g.customer.name ?? g.customer.phone) : null,
      recordType: g.customer ? "customer" : undefined,
      recordId: g.customer?.id,
    },
    { type: "property", label: "Property", value: property },
    {
      type: "job",
      label: "Job",
      value: g.job ? jobStatusLabel(g.job.status) : null,
      recordType: g.job ? "job" : undefined,
      recordId: g.job?.id,
    },
    { type: "technician", label: "Technician", value: g.job?.technician?.name ?? null },
    {
      type: "estimate",
      label: "Estimate",
      value: g.estimate ? `${formatCents(g.estimate.amountCents)} · ${g.estimate.status}` : null,
    },
    {
      type: "payment",
      label: "Payment",
      value:
        g.paidCents > 0
          ? `${formatCents(g.paidCents)} collected`
          : g.invoice
            ? `${formatCents(g.invoice.amountCents)} invoiced · unpaid`
            : null,
    },
  ];
}

function buildEvents(g: Graph): RecordEvent[] {
  const events: RecordEvent[] = [];
  const push = (at: Date | null | undefined, label: string, tone: RecordEvent["tone"], detail?: string | null) => {
    if (at) events.push({ at: at.toISOString(), label, tone, detail: detail ?? null });
  };

  if (g.call) {
    push(
      g.call.createdAt,
      "Call answered by Orvius",
      "neutral",
      g.call.durationSec ? `${Math.round(g.call.durationSec / 60) || 1} min` : null,
    );
    push(g.call.ownerNotifiedAt, "Owner alerted", "success");
  }
  if (g.lead) {
    push(g.lead.createdAt, g.call ? "Lead captured from call" : `Lead captured · ${g.lead.source}`, "neutral", g.lead.serviceType);
    push(g.lead.firstContactedAt, "Shop contacted customer", "success");
    if (g.lead.closedAt && g.lead.status !== "booked") {
      push(g.lead.closedAt, `Lead closed · ${g.lead.status}`, g.lead.status === "lost" ? "risk" : "neutral");
    }
  }
  if (g.customer && g.customer.interactionCount > 1) {
    push(g.customer.firstSeenAt, "First seen as a customer", "neutral", `${g.customer.interactionCount} touches total`);
  }
  if (g.job) {
    push(g.job.createdAt, "Job booked", "success", g.job.title);
    push(g.job.customerConfirmSentAt, "Confirmation text sent", "neutral");
    push(g.job.customerConfirmedAt, "Customer confirmed window", "success");
    push(g.job.dispatchedAt, "Technician dispatched", "neutral", g.job.technician?.name);
    push(g.job.onSiteAt, "Technician on site", "neutral");
    push(g.job.completedAt, "Job completed", "success", g.job.finalAmountCents ? formatCents(g.job.finalAmountCents) : null);
  }
  if (g.estimate) {
    push(g.estimate.sentAt, "Estimate sent", "neutral", formatCents(g.estimate.amountCents));
    push(g.estimate.acceptedAt, "Estimate accepted", "success");
  }
  if (g.invoice) push(g.invoice.createdAt, "Invoice created", "neutral", formatCents(g.invoice.amountCents));
  push(g.lastPaymentAt, "Payment recorded", "success", g.paidCents ? formatCents(g.paidCents) : null);

  return events.sort((a, b) => b.at.localeCompare(a.at));
}

function buildDecisions(g: Graph): string[] {
  const out: string[] = [];
  if (g.lead?.urgency) out.push(`Classified urgency as ${g.lead.urgency}`);
  if (g.lead?.serviceType) out.push(`Understood request as “${g.lead.serviceType}”`);
  if (g.call?.ownerNotifiedAt) out.push("Alerted the owner");
  if (g.job) out.push(g.lead ? "Booked the lead into a job" : "Job created by the shop");
  else if (g.lead?.status === "new") out.push("Held for the owner — not booked yet");
  if (g.lead?.status === "spam") out.push("Marked not a job");
  if (g.job?.technician) out.push(`Assigned to ${g.job.technician.name}`);
  return out;
}

function buildNext(g: Graph): RecordView["next"] {
  if (g.job) {
    if (!g.job.technician && g.job.status !== "completed" && g.job.status !== "cancelled") {
      return { label: "Assign technician", href: "/dashboard/dispatch", detail: "Job is booked but nobody owns it." };
    }
    const step = nextJobStatus(g.job.status);
    if (step) {
      return { label: step.label, href: recordHref("job", g.job.id), detail: `Move the job to ${step.label.toLowerCase()}.` };
    }
    if (g.job.status === "completed" && !g.invoice && !g.job.finalAmountCents) {
      return { label: "Record the outcome", href: recordHref("job", g.job.id), detail: "Capture the final amount so the job counts toward revenue." };
    }
    if (g.invoice && g.paidCents < g.invoice.amountCents) {
      return { label: "Collect payment", href: recordHref("job", g.job.id), detail: "Invoice is open." };
    }
    return null;
  }
  if (g.lead) {
    if (g.lead.status !== "new" && g.lead.status !== "contacted") return null;
    const next = leadNextAction({ ...g.lead, jobId: null });
    if (next.kind === "call") {
      return {
        label: next.label,
        href: telHref(next.phone),
        detail: next.label === "Call now"
          ? "Emergency — talk to them before anything else, then book."
          : "No service address yet — get it on the call, then book.",
      };
    }
    if (next.kind === "book") {
      return { label: "Book job", href: recordHref("lead", g.lead.id), detail: "Pick a window and create the job from this lead." };
    }
    return null;
  }
  if (g.call && !g.lead) {
    return { label: "Review call", href: recordHref("call", g.call.id), detail: "No lead was captured from this call." };
  }
  return null;
}

const LEAD_CHANNEL: Record<string, string> = {
  call: "Phone call",
  sms: "Text message",
  web: "Web form",
  email: "Email",
  manual: "Added by the shop",
};

function leadChannel(source: string | null | undefined): string {
  if (!source) return "Lead";
  return LEAD_CHANNEL[source.toLowerCase()] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

const AUDIT_TONE: Record<string, RecordEvent["tone"]> = {
  "job.booked": "success",
  "technician.assigned": "success",
  "customer.confirmation_sent": "success",
  "customer.matched": "success",
  "lead.escalated": "risk",
  "lead.held": "attention",
  "technician.unassigned": "attention",
  "customer.confirmation_skipped": "attention",
  "copilot.executed": "success",
};

export async function getRecordView(
  businessId: string,
  type: RecordType,
  id: string,
): Promise<RecordView | null> {
  const g = await resolveGraph(businessId, type, id);
  if (!g) return null;

  const person = g.lead?.name ?? g.customer?.name ?? null;
  const phone = g.lead?.phone ?? g.customer?.phone ?? g.call?.callerPhone ?? null;

  let title: string;
  let subtitle: string | null;
  let status: string | null;
  if (type === "job" && g.job) {
    title = g.job.title;
    subtitle = person ?? phone;
    status = jobStatusLabel(g.job.status);
  } else if (type === "customer" && g.customer) {
    title = g.customer.name ?? g.customer.phone;
    subtitle = `${g.customer.interactionCount} touch${g.customer.interactionCount === 1 ? "" : "es"}`;
    status = null;
  } else if (type === "lead" && g.lead) {
    title = person ?? phone ?? "Unknown caller";
    subtitle = g.lead.serviceType;
    status = g.lead.status;
  } else {
    title = person ?? phone ?? "Unknown caller";
    subtitle = g.lead?.serviceType ?? g.call?.summary?.slice(0, 80) ?? null;
    status = g.call?.status ?? null;
  }

  const sourceAt = g.call?.createdAt ?? g.lead?.createdAt ?? g.customer?.firstSeenAt ?? g.job?.createdAt;
  const view: RecordView = {
    type,
    id,
    title,
    subtitle,
    status,
    source: sourceAt
      ? {
          channel: g.call ? "Phone call" : g.lead ? leadChannel(g.lead.source) : "Shop record",
          from: phone,
          at: sourceAt.toISOString(),
        }
      : null,
    summary: g.call?.summary ?? g.lead?.notes ?? null,
    transcript: g.call?.transcript ?? null,
    captured: [
      { label: "Name", value: person },
      { label: "Phone", value: phone },
      { label: "Email", value: g.lead?.email ?? g.customer?.email ?? null },
      { label: "Service", value: g.job?.serviceType ?? g.lead?.serviceType ?? null },
      { label: "Urgency", value: g.job?.urgency ?? g.lead?.urgency ?? null },
      { label: "Address", value: g.job?.address ?? g.lead?.address ?? g.customer?.address ?? null },
      { label: "Scheduled", value: iso(g.job?.scheduledAt) },
    ],
    decisions: buildDecisions(g),
    events: buildEvents(g),
    path: buildPath(g),
    next: buildNext(g),
    fullHref: recordHref(type, id),
  };

  const audit = await listAuditFor({
    businessId,
    callId: g.call?.id,
    leadId: g.lead?.id,
    jobId: g.job?.id,
    customerId: type === "customer" ? g.customer?.id : null,
  });
  if (audit.length) {
    // The audit trail is the record of what was decided; timestamps fill in
    // only the lifecycle steps the audit does not narrate.
    const narrated = /^(Call answered|Lead captured|Job booked|Confirmation text sent|Owner alerted)/;
    view.events = [
      ...audit.map((a) => ({
        at: a.at,
        label: a.summary,
        detail: a.actor === "orvius" ? "Orvius" : a.actor === "owner" ? "Owner" : "System",
        tone: AUDIT_TONE[a.action] ?? ("neutral" as const),
      })),
      ...view.events.filter((e) => !narrated.test(e.label)),
    ].sort((a, b) => b.at.localeCompare(a.at));
    view.decisions = audit
      .filter((a) => a.actor === "orvius")
      .slice()
      .reverse()
      .map((a) => a.summary);
  }

  if (type === "customer" && g.customer) {
    const [jobs, leads] = await Promise.all([
      prisma.job.findMany({
        where: { businessId, customerId: g.customer.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, title: true, status: true, createdAt: true },
      }),
      prisma.lead.findMany({
        where: { businessId, customerId: g.customer.id },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, serviceType: true, status: true, createdAt: true },
      }),
    ]);
    view.history = [
      ...jobs.map((j) => ({ type: "job" as const, id: j.id, title: j.title, at: j.createdAt.toISOString(), status: jobStatusLabel(j.status) })),
      ...leads.map((l) => ({ type: "lead" as const, id: l.id, title: l.serviceType ?? "Request", at: l.createdAt.toISOString(), status: l.status })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  }

  return view;
}
