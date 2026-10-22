import { collectAttention } from "@/lib/attention-queue";
import { PAST_DUE_LABEL, jobPastDue } from "@/lib/job-status";
import { formatCentsTidy } from "@/lib/money";
import { personName } from "@/lib/people";
import type { AttentionItem, AttentionKind } from "@/lib/attention-types";
import { buildCommandBoard, type BoardItem, type ExceptionKind } from "@/lib/command-board";
import { prisma } from "@/lib/prisma";
import { callerSpokeSpanish } from "@/lib/caller-language";
import { spokenName } from "@/lib/spoken-name";

/*
  Work is one list of everything a shop has to do for a customer, from the
  first call to the last payment. A request that is not booked yet (a lead
  with no job) and a booked job are the same work item at different stages;
  booking moves it forward, it does not turn it into something else.

  Leads and jobs stay separate tables underneath, because a job still means
  "booked" everywhere the shop's numbers are counted. This module is the one
  place that reads both as Work, and the one place that decides what needs a
  person: Command, the Work screen and the tab badge all read the same items,
  so they cannot disagree about what is waiting on the owner.
*/

export const WORK_STAGES = [
  "needs_callback",
  "needs_time",
  "scheduled",
  "confirmed",
  "on_the_way",
  "on_site",
  "done",
  "cancelled",
  "spam",
] as const;
export type WorkStage = (typeof WORK_STAGES)[number];

export const WORK_STAGE_LABEL: Record<WorkStage, string> = {
  needs_callback: "Needs a callback",
  needs_time: "Needs a time",
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  on_the_way: "On the way",
  on_site: "On site",
  done: "Done",
  cancelled: "Cancelled",
  spam: "Spam",
};

const OPEN_STAGES = new Set<WorkStage>(["needs_callback", "needs_time", "scheduled", "confirmed", "on_the_way", "on_site"]);

export type WorkSeverity = "critical" | "high" | "med";

/** Something wrong with one piece of work, found by the same rules that page the owner. */
export type WorkProblem = {
  kind: ExceptionKind | AttentionKind;
  label: string;
  detail: string;
  severity: WorkSeverity;
};

/** Who the next step is waiting on. Only "you" (or a problem) puts work in front of a person. */
export type WaitingOn = "you" | "customer" | "technician" | null;

/** One beat of the work, in order. The first unfinished beat is the one happening. */
export type WorkPathBeat = { key: string; label: string; state: "done" | "now" | "wait" };

export type WorkRequest = {
  id: string;
  name: string | null;
  phone: string | null;
  serviceType: string | null;
  urgency: string | null;
  address: string | null;
  status: string;
  assigneeEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  call?: { transcript: string | null } | null;
};

export type WorkJob = {
  id: string;
  leadId: string | null;
  title: string;
  serviceType: string | null;
  urgency: string | null;
  address: string | null;
  status: string;
  scheduledAt: Date | null;
  customerConfirmedAt: Date | null;
  customerConfirmSentAt?: Date | null;
  techAcceptedAt?: Date | null;
  techDeclinedBy?: string | null;
  assigneeEmail: string | null;
  technician: { id: string; name: string; phone?: string | null } | null;
  customer: { name: string | null; phone: string | null } | null;
  invoices: Array<{ status: string; paidAt: Date | null; amountCents: number; payments?: Array<{ status: string }> }>;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkItem = {
  /** The job's id once booked, the request's id before; stable as long as the stage is. */
  key: string;
  kind: "request" | "job";
  id: string;
  /** The request this came from; on a request it is its own id. */
  leadId: string | null;
  href: string;
  title: string;
  customer: string | null;
  phone: string | null;
  address: string | null;
  urgent: boolean;
  stage: WorkStage;
  stageLabel: string;
  open: boolean;
  responsible: { kind: "teammate" | "technician" | "owner"; label: string; email: string | null };
  technician: { name: string; phone: string | null } | null;
  nextAction: string | null;
  waitingOn: WaitingOn;
  problems: WorkProblem[];
  /** A plan Orvius made for this work that is waiting on approval. */
  approvalId: string | null;
  /** A person took this customer's texts over from Orvius. */
  takenOver: boolean;
  needsYou: boolean;
  /** Booked, confirmed, the technician, and the bill when money is in play. */
  path: WorkPathBeat[];
  /** Dollars still owed, the way a charge list prints the amount. Null when nothing is owed. */
  amountLabel: string | null;
  /** Set when the caller spoke Spanish. Null when the call was English or there is no transcript. */
  lang: "es" | null;
  scheduledAt: string | null;
  updatedAt: string;
  createdAt: string;
};

const isUrgent = (urgency: string | null) => urgency === "emergency" || urgency === "same-day";

export function requestStage(status: string): WorkStage {
  if (status === "spam") return "spam";
  if (status === "lost") return "cancelled";
  if (status === "new") return "needs_callback";
  return "needs_time";
}

export function jobStage(job: Pick<WorkJob, "status" | "scheduledAt">): WorkStage {
  switch (job.status) {
    case "cancelled":
      return "cancelled";
    case "completed":
      return "done";
    case "on_site":
      return "on_site";
    case "en_route":
      return "on_the_way";
    case "confirmed":
      return "confirmed";
    default:
      return job.scheduledAt ? "scheduled" : "needs_time";
  }
}

const unpaidInvoices = (job: Pick<WorkJob, "invoices">) =>
  job.invoices.filter((i) => !i.paidAt && i.status !== "void" && i.status !== "paid" && i.status !== "refunded");

function responsibleFor(
  assigneeEmail: string | null,
  technician: { name: string } | null,
  fieldStage: boolean,
): WorkItem["responsible"] {
  if (assigneeEmail) return { kind: "teammate", label: personName(assigneeEmail), email: assigneeEmail };
  if (technician && fieldStage) return { kind: "technician", label: technician.name, email: null };
  return { kind: "owner", label: "You", email: null };
}

function finish(item: Omit<WorkItem, "needsYou">): WorkItem {
  return { ...item, needsYou: item.open && (item.waitingOn === "you" || item.problems.length > 0 || Boolean(item.approvalId)) };
}

function pathOf(steps: Array<{ key: string; label: string; done: boolean; hold?: boolean }>): WorkPathBeat[] {
  let marked = false;
  return steps.map((step) => {
    if (step.done) return { key: step.key, label: step.label, state: "done" };
    if (step.hold || marked) return { key: step.key, label: step.label, state: "wait" };
    marked = true;
    return { key: step.key, label: step.label, state: "now" };
  });
}

function techLabel(name: string | null | undefined): string {
  return spokenName(name).split(/\s+/)[0] || "Tech";
}

function owedAmount(job: Pick<WorkJob, "invoices">): string | null {
  const owed = unpaidInvoices(job);
  if (!owed.length) return null;
  return formatCentsTidy(owed.reduce((sum, invoice) => sum + invoice.amountCents, 0));
}

function requestPath(lead: WorkRequest): WorkPathBeat[] {
  if (lead.status === "lost" || lead.status === "spam") {
    return [
      { key: "called", label: "Called", state: "done" },
      { key: "booked", label: "Booked", state: "wait" },
    ];
  }
  return pathOf([
    { key: "called", label: "Called", done: true },
    { key: "booked", label: "Booked", done: lead.status === "booked" },
  ]);
}

function jobPath(job: WorkJob, stage: WorkStage): WorkPathBeat[] {
  const tech = job.technician ? techLabel(job.technician.name) : "Tech";
  if (stage === "cancelled") {
    return [
      { key: "booked", label: "Booked", state: "done" },
      { key: "confirmed", label: "Confirmed", state: "wait" },
      { key: "tech", label: tech, state: "wait" },
    ];
  }
  const field = stage === "on_the_way" || stage === "on_site" || stage === "done";
  const confirmed = Boolean(job.customerConfirmedAt) || stage === "confirmed" || field;
  const accepted = Boolean(job.techAcceptedAt) || field;
  const owed = unpaidInvoices(job);
  const steps: Array<{ key: string; label: string; done: boolean; hold?: boolean }> = [
    { key: "booked", label: "Booked", done: true },
    { key: "confirmed", label: "Confirmed", done: confirmed },
    { key: "tech", label: tech, done: accepted, hold: !accepted && !job.technician },
  ];
  if (stage === "done" || owed.length > 0) {
    const paid = owed.length === 0;
    steps.push({ key: "bill", label: paid ? "Paid" : "Unpaid", done: paid });
  }
  return pathOf(steps);
}

export function requestWorkItem(lead: WorkRequest): WorkItem {
  const stage = requestStage(lead.status);
  const who = lead.name?.trim() || "the caller";
  const nextAction =
    stage === "needs_callback"
      ? lead.urgency === "emergency"
        ? `Call ${who} back now — emergency`
        : `Call ${who} back`
      : stage === "needs_time"
        ? lead.status === "booked"
          ? "Put the booked time on the schedule"
          : `Pick a time with ${who}`
        : null;
  const open = OPEN_STAGES.has(stage);
  return finish({
    key: `request:${lead.id}`,
    kind: "request",
    id: lead.id,
    leadId: lead.id,
    href: `/dashboard/inbox/${lead.id}`,
    title: lead.serviceType?.trim() || "New request",
    customer: lead.name,
    phone: lead.phone,
    address: lead.address,
    urgent: isUrgent(lead.urgency),
    stage,
    stageLabel: WORK_STAGE_LABEL[stage],
    open,
    responsible: responsibleFor(lead.assigneeEmail, null, false),
    technician: null,
    nextAction,
    waitingOn: open ? "you" : null,
    problems: [],
    approvalId: null,
    takenOver: false,
    path: requestPath(lead),
    amountLabel: null,
    lang: callerSpokeSpanish(lead.call?.transcript) ? "es" : null,
    scheduledAt: null,
    updatedAt: lead.updatedAt.toISOString(),
    createdAt: lead.createdAt.toISOString(),
  });
}

export function jobWorkItem(job: WorkJob, now = Date.now()): WorkItem {
  const stage = jobStage(job);
  const pastDue = jobPastDue(job, now);
  const owed = unpaidInvoices(job);
  const who = job.customer?.name?.trim() || "the customer";
  const assign: [string, WaitingOn] = job.techDeclinedBy ? [`Assign someone else — ${job.techDeclinedBy} can't take it`, "you"] : ["Assign a technician", "you"];
  const techAnswer: [string | null, WaitingOn] = job.techAcceptedAt || !job.technician ? [null, null] : [`Waiting on ${job.technician.name} to accept`, "technician"];
  const [nextAction, waitingOn] = ((): [string | null, WaitingOn] => {
    if (pastDue) return [PAST_DUE_LABEL, "you"];
    switch (stage) {
      case "needs_time":
        return ["Set the time", "you"];
      case "scheduled":
        if (!job.technician) return assign;
        if (job.customerConfirmedAt) return techAnswer;
        return job.customerConfirmSentAt
          ? [`Waiting on ${who} to confirm`, "customer"]
          : ["Confirm the time with the customer", "you"];
      case "confirmed":
        return job.technician ? techAnswer : assign;
      case "on_the_way":
        return ["Mark arrived", "technician"];
      case "on_site":
        return ["Mark done", "technician"];
      case "done": {
        if (!owed.length) return [null, null];
        const figure = owedAmount(job);
        if (owed.some((i) => i.payments?.some((p) => p.status === "claimed"))) {
          return [figure ? `Confirm ${who}'s ${figure} payment arrived` : `Confirm ${who}'s payment arrived`, "you"];
        }
        if (owed.some((i) => i.status === "draft")) return [figure ? `Send the ${figure} invoice` : "Send the invoice", "you"];
        return [figure ? `${figure} waiting on ${who} to pay` : `Waiting on ${who} to pay`, "customer"];
      }
      default:
        return [null, null];
    }
  })();
  const fieldStage = stage !== "done" && stage !== "cancelled";
  return finish({
    key: `job:${job.id}`,
    kind: "job",
    id: job.id,
    leadId: job.leadId,
    href: `/dashboard/jobs/${job.id}`,
    title: job.title,
    customer: job.customer?.name ?? null,
    phone: job.customer?.phone ?? null,
    address: job.address,
    urgent: isUrgent(job.urgency),
    stage,
    stageLabel: WORK_STAGE_LABEL[stage],
    open: OPEN_STAGES.has(stage) || (stage === "done" && owed.length > 0),
    responsible: responsibleFor(job.assigneeEmail, job.technician, fieldStage),
    technician: job.technician ? { name: job.technician.name, phone: job.technician.phone ?? null } : null,
    nextAction,
    waitingOn,
    problems: [],
    approvalId: null,
    takenOver: false,
    path: jobPath(job, stage),
    amountLabel: owedAmount(job),
    lang: null,
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
  });
}

const STAGE_ORDER = new Map(WORK_STAGES.map((s, i) => [s, i]));
const SEVERITY_ORDER: Record<WorkSeverity, number> = { critical: 0, high: 1, med: 2 };
const worst = (i: WorkItem) => Math.min(i.approvalId ? SEVERITY_ORDER.high : 3, ...i.problems.map((p) => SEVERITY_ORDER[p.severity]));

/** What needs a person first, then the worst problem, urgent work, work with a next step, earlier stages, then time. */
export function sortWork(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1;
    const severity = worst(a) - worst(b);
    if (severity) return severity;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (Boolean(a.nextAction) !== Boolean(b.nextAction)) return a.nextAction ? -1 : 1;
    const stage = STAGE_ORDER.get(a.stage)! - STAGE_ORDER.get(b.stage)!;
    if (stage) return stage;
    const at = (i: WorkItem) => Date.parse(i.scheduledAt ?? i.createdAt);
    return at(a) - at(b);
  });
}

/* ---------------- Problems: the owner-paging rules, attached to the work they are about ---------------- */

const EXCEPTION_PROBLEM: Partial<Record<ExceptionKind, { label: string; severity: WorkSeverity }>> = {
  emergency: { label: "Safety call", severity: "critical" },
  failed_message: { label: "Text failed", severity: "high" },
  unconfirmed_soon: { label: "Starts soon, not confirmed", severity: "high" },
  tech_declined: { label: "Technician can't take it", severity: "critical" },
  tech_unanswered: { label: "Technician hasn't accepted", severity: "high" },
  stale: { label: "Window passed", severity: "high" },
  duplicate: { label: "Possible duplicate", severity: "med" },
  takeover: { label: "You have the conversation", severity: "med" },
  billing_gap: { label: "Done, not billed", severity: "high" },
  invoice_unsent: { label: "Bill not sent", severity: "high" },
  billing_inconsistent: { label: "Billing doesn't match", severity: "high" },
  invoice_undelivered: { label: "Bill delivery problem", severity: "high" },
};

/** Attention rows that are a problem with one piece of work. The rest restate its stage, or are about the shop. */
const ATTENTION_PROBLEM: Partial<Record<AttentionKind, string>> = {
  alert_failed: "Your alert failed",
  alert_unacked: "Alert not seen",
  deposit_delivery_failed: "Deposit text failed",
  deposit_failed: "Deposit unpaid",
  overdue_followup: "Follow-up overdue",
  appointment_at_risk: "At risk",
  tech_no_show: "Technician late",
  customer_no_show: "Customer no-show",
  open_invoice: "Invoice unpaid",
  open_estimate: "Estimate open",
  estimate_failed: "Estimate needs you",
  wants_human: "Asked for a person",
  partial_capture: "Call cut off",
  transcript_dispute: "Caller disputes the call",
  not_a_job: "Maybe not a job",
};

/** Restate the stage or next action the work item already shows, so they are not problems of their own. */
const ATTENTION_STAGE: ReadonlySet<AttentionKind> = new Set<AttentionKind>([
  "urgent_lead",
  "new_lead",
  "needs_qualify",
  "needs_booking",
  "needs_customer_confirm",
  "unassigned_job",
  "available_tech",
  /* Unfinished line setup is the banner above Command. */
  "needs_capture",
]);

/** A problem about the shop rather than one customer: alerts, billing, the line, the crew. */
export type ShopIssue = {
  id: string;
  kind: ExceptionKind | AttentionKind;
  title: string;
  detail: string;
  action: string;
  href: string | null;
  severity: WorkSeverity;
  /** Set for an open reconciliation exception: resolving it asks what was done. */
  resolveId?: string;
  systemOfRecord?: string;
  providerHref?: string | null;
};

const phoneKey = (p: string | null | undefined) => (p ? p.replace(/[^\d]/g, "").slice(-10) : "");

function hrefTarget(href: string): { kind: "job" | "lead"; id: string } | null {
  const m = /^\/dashboard\/(jobs|inbox)\/([A-Za-z0-9_-]+)/.exec(href);
  if (!m || m[2] === "new" || m[2] === "messages") return null;
  return { kind: m[1] === "jobs" ? "job" : "lead", id: m[2] };
}

type Problems = {
  byJob: Map<string, WorkProblem[]>;
  byLead: Map<string, WorkProblem[]>;
  byPhone: Map<string, WorkProblem[]>;
  approvals: BoardItem[];
  shop: ShopIssue[];
};

function push<K>(map: Map<K, WorkProblem[]>, key: K, problem: WorkProblem) {
  const list = map.get(key) ?? [];
  if (!list.some((p) => p.kind === problem.kind)) list.push(problem);
  map.set(key, list);
}

export function problemsFrom(board: { exceptions: BoardItem[]; approvals: BoardItem[] }, attention: AttentionItem[]): Problems {
  const out: Problems = { byJob: new Map(), byLead: new Map(), byPhone: new Map(), approvals: board.approvals, shop: [] };

  for (const e of board.exceptions) {
    if (e.exception === "record_mismatch") {
      out.shop.push({
        id: e.id,
        kind: e.exception,
        title: e.title,
        detail: e.detail,
        action: e.jobId ? "Open the job" : "Open billing",
        href: e.jobId ? `/dashboard/jobs/${e.jobId}` : "/dashboard/billing",
        severity: "med",
        ...(e.reconcileId ? { resolveId: e.reconcileId } : {}),
        ...(e.systemOfRecord ? { systemOfRecord: e.systemOfRecord, providerHref: e.providerHref ?? null } : {}),
      });
      continue;
    }
    const rule = e.exception ? EXCEPTION_PROBLEM[e.exception] : undefined;
    if (!rule) {
      // A practice shop's undeliverable number is refused on purpose. That is
      // not the shop being down, and it does not get the page-level banner.
      if (/Simulated carrier/.test(e.detail ?? "")) continue;
      out.shop.push({ id: e.id, kind: e.exception ?? "alert_setup", title: e.title, detail: e.detail, action: "Fix alerts", href: "/dashboard?settings=notifications", severity: "critical" });
      continue;
    }
    const problem: WorkProblem = { kind: e.exception!, label: rule.label, detail: e.detail, severity: rule.severity };
    if (e.jobId) push(out.byJob, e.jobId, problem);
    else if (e.leadId) push(out.byLead, e.leadId, problem);
    else if (e.phone) push(out.byPhone, phoneKey(e.phone), problem);
  }

  for (const a of attention) {
    if (ATTENTION_STAGE.has(a.kind)) continue;
    const label = ATTENTION_PROBLEM[a.kind];
    const target = hrefTarget(a.href) ?? (a.entityType === "lead" ? { kind: "lead" as const, id: a.entityId } : null);
    if (label && target) {
      const problem: WorkProblem = { kind: a.kind, label, detail: a.detail, severity: a.impact };
      push(target.kind === "job" ? out.byJob : out.byLead, target.id, problem);
      continue;
    }
    out.shop.push({ id: a.id, kind: a.kind, title: a.title, detail: a.detail, action: a.recommendedAction, href: a.href || null, severity: a.impact });
  }
  return out;
}

/** Problem text written for a list of strangers repeats the title and crew the card already shows. */
function withoutRepeats(detail: string, item: WorkItem) {
  const same = (a: string, b: string | null | undefined) => Boolean(b) && a.trim().toLowerCase() === b!.trim().toLowerCase();
  const parts = detail.split(" · ").filter((part) => !same(part, item.title) && !same(part, item.customer) && !/^Tech: /.test(part));
  return parts.join(" · ") || detail;
}

/**
  A late job is one problem, not four. The window passing with nobody on site
  is the fact; "tech late", "at risk" and "customer no-show" are three guesses
  at its cause, and the owner settles which by calling.
*/
function attach(item: WorkItem, problems: WorkProblem[], approvalId: string | null, takenOver: boolean): WorkItem {
  let list = problems;
  if (list.some((p) => p.kind === "stale")) list = list.filter((p) => p.kind !== "tech_no_show" && p.kind !== "appointment_at_risk" && p.kind !== "customer_no_show");
  list = [...list]
    .map((p) => ({ ...p, detail: withoutRepeats(p.detail, item) }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const open = item.open || list.length > 0 || Boolean(approvalId);
  const action = list[0] ? problemAction(list[0].kind, item) : null;
  return finish({ ...item, ...(action ? { nextAction: action[0], waitingOn: action[1] } : {}), open, problems: list, approvalId, takenOver });
}

/** The worst problem's own fix, when it is not the step the stage would suggest. */
function problemAction(kind: WorkProblem["kind"], item: WorkItem): [string, WaitingOn] | null {
  if (kind === "billing_gap") return ["Open the bill", "you"];
  if (kind === "invoice_unsent") return ["Send it from the job when you're ready", "you"];
  if (kind === "billing_inconsistent") return ["Review the bill", "you"];
  if (kind === "invoice_undelivered") return [`Call ${item.customer ?? "the customer"} or resend the bill`, "you"];
  if (kind === "tech_unanswered" && item.technician) {
    return item.technician.phone ? [`Call ${item.technician.name}`, "you"] : [`Add ${item.technician.name}'s mobile number in Team`, "you"];
  }
  return null;
}

/* ---------------- Reading a shop's work ---------------- */

const LIMIT = 300;
const CLOSED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const jobSelect = {
  id: true,
  leadId: true,
  title: true,
  serviceType: true,
  urgency: true,
  address: true,
  status: true,
  scheduledAt: true,
  customerConfirmedAt: true,
  customerConfirmSentAt: true,
  techAcceptedAt: true,
  techDeclinedBy: true,
  assigneeEmail: true,
  createdAt: true,
  updatedAt: true,
  technician: { select: { id: true, name: true, phone: true } },
  customer: { select: { name: true, phone: true } },
  invoices: { select: { status: true, paidAt: true, amountCents: true, payments: { where: { status: "claimed" }, select: { status: true } } } },
} as const;

const requestSelect = {
  id: true,
  name: true,
  phone: true,
  serviceType: true,
  urgency: true,
  address: true,
  status: true,
  assigneeEmail: true,
  createdAt: true,
  updatedAt: true,
  call: { select: { transcript: true } },
} as const;

export type WorkView = "open" | "closed";

export type WorkBoard = {
  items: WorkItem[];
  truncated: boolean;
  /** Plans Orvius made that wait on approval, including ones not tied to a single job. */
  approvals: BoardItem[];
  shopIssues: ShopIssue[];
  /** The number Command, the Work tab and the nav badge all show. */
  needsYou: number;
};

/** One shop's Work. Open is everything with a next step or a problem; closed is the last 30 days of finished, cancelled and spam. */
export async function listWork(
  businessId: string,
  view: WorkView = "open",
  now = new Date(),
  /** Attention rows the caller already loaded for the same moment. */
  preloaded?: { attention?: Promise<AttentionItem[]> },
): Promise<WorkBoard> {
  const since = new Date(now.getTime() - CLOSED_WINDOW_MS);
  const [requests, jobs, problems, takeovers] = await Promise.all([
    prisma.lead.findMany({
      where:
        view === "open"
          ? { businessId, job: { is: null }, status: { in: ["new", "contacted", "booked"] } }
          : { businessId, job: { is: null }, status: { in: ["lost", "spam"] }, updatedAt: { gte: since } },
      select: requestSelect,
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    prisma.job.findMany({
      where:
        view === "open"
          ? {
              businessId,
              OR: [
                { status: { notIn: ["completed", "cancelled"] } },
                { status: "completed", invoices: { some: { paidAt: null, status: { notIn: ["void", "paid", "refunded"] } } } },
              ],
            }
          : { businessId, status: { in: ["completed", "cancelled"] }, updatedAt: { gte: since } },
      select: jobSelect,
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    view === "open"
      ? Promise.all([buildCommandBoard(businessId, now), preloaded?.attention ?? collectAttention(businessId, now)]).then(([board, attention]) =>
          problemsFrom(board.lanes, attention),
        )
      : null,
    view === "open" ? prisma.takeover.findMany({ where: { businessId, releasedAt: null }, select: { phoneNormalized: true } }) : [],
  ]);
  const takenPhones = new Set(takeovers.map((t) => phoneKey(t.phoneNormalized)));

  const base = [...requests.map(requestWorkItem), ...jobs.map((job) => jobWorkItem(job, now.getTime()))];
  if (!problems) {
    const closed = base.filter((i) => !i.open).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return { items: closed, truncated: requests.length === LIMIT || jobs.length === LIMIT, approvals: [], shopIssues: [], needsYou: 0 };
  }

  /* A problem can be about work that is otherwise finished — an unpaid invoice on a closed job, a quote on a lost request. */
  const present = new Set(base.map((i) => i.key));
  const jobByLead = new Map(jobs.filter((j) => j.leadId).map((j) => [j.leadId!, j.id]));
  const approvalTargets = problems.approvals.flatMap((a) => (a.jobId ? [`job:${a.jobId}`] : a.leadId ? [`lead:${a.leadId}`] : []));
  const leadIds = [...new Set([...problems.byLead.keys(), ...approvalTargets.filter((k) => k.startsWith("lead:")).map((k) => k.slice(5))])];
  const missingLeadJobs = leadIds.filter((id) => !jobByLead.has(id) && !present.has(`request:${id}`));
  if (missingLeadJobs.length) {
    for (const j of await prisma.job.findMany({ where: { businessId, leadId: { in: missingLeadJobs } }, select: { id: true, leadId: true } })) {
      jobByLead.set(j.leadId!, j.id);
    }
  }
  const keyForLead = (id: string) => (jobByLead.has(id) ? `job:${jobByLead.get(id)}` : `request:${id}`);

  const problemsByKey = new Map<string, WorkProblem[]>();
  const add = (key: string, list: WorkProblem[]) => {
    const into = problemsByKey.get(key) ?? [];
    for (const p of list) if (!into.some((q) => q.kind === p.kind)) into.push(p);
    problemsByKey.set(key, into);
  };
  for (const [id, list] of problems.byJob) add(`job:${id}`, list);
  for (const [id, list] of problems.byLead) add(keyForLead(id), list);
  const approvalByKey = new Map<string, string>();
  for (const a of problems.approvals) {
    if (a.needsCheck) continue;
    const key = a.jobId ? `job:${a.jobId}` : a.leadId ? keyForLead(a.leadId) : null;
    if (key && a.proposalId && !approvalByKey.has(key)) approvalByKey.set(key, a.proposalId);
  }

  const extraJobs = [...new Set([...problemsByKey.keys(), ...approvalByKey.keys()])].filter((k) => !present.has(k));
  const [moreJobs, moreRequests] = await Promise.all([
    extraJobs.some((k) => k.startsWith("job:"))
      ? prisma.job.findMany({ where: { businessId, id: { in: extraJobs.filter((k) => k.startsWith("job:")).map((k) => k.slice(4)) } }, select: jobSelect })
      : [],
    extraJobs.some((k) => k.startsWith("request:"))
      ? prisma.lead.findMany({
          where: { businessId, id: { in: extraJobs.filter((k) => k.startsWith("request:")).map((k) => k.slice(8)) } },
          select: requestSelect,
        })
      : [],
  ]);
  const all = [...base, ...moreJobs.map((job) => jobWorkItem(job, now.getTime())), ...moreRequests.map(requestWorkItem)];

  const shopIssues = [...problems.shop];
  const matchedPhones = new Set<string>();
  const items = all.map((item) => {
    const list = [...(problemsByKey.get(item.key) ?? [])];
    const byPhone = problems.byPhone.get(phoneKey(item.phone));
    if (byPhone && item.open) {
      for (const p of byPhone) if (!list.some((q) => q.kind === p.kind)) list.push(p);
      matchedPhones.add(phoneKey(item.phone));
    }
    return attach(item, list, approvalByKey.get(item.key) ?? null, takenPhones.has(phoneKey(item.phone)));
  });
  for (const [phone, list] of problems.byPhone) {
    if (matchedPhones.has(phone)) continue;
    for (const p of list) shopIssues.push({ id: `${p.kind}:${phone}`, kind: p.kind, title: p.label, detail: p.detail, action: "Open messages", href: "/dashboard/inbox/messages", severity: p.severity });
  }

  const open = sortWork(items.filter((i) => i.open));
  const attachedApprovals = new Set(approvalByKey.values());
  const looseApprovals = problems.approvals.filter((a) => !a.proposalId || !attachedApprovals.has(a.proposalId));
  shopIssues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return {
    items: open,
    truncated: requests.length === LIMIT || jobs.length === LIMIT,
    approvals: problems.approvals,
    shopIssues,
    needsYou: open.filter((i) => i.needsYou).length + looseApprovals.length,
  };
}

/** Who on the team can be made responsible: the owner and every member. */
export async function workAssignees(business: { id: string; ownerEmail: string | null }) {
  const members = await prisma.membership.findMany({ where: { businessId: business.id }, select: { email: true, role: true } });
  return [
    ...(business.ownerEmail ? [{ email: business.ownerEmail.toLowerCase(), role: "owner" }] : []),
    ...members.map((m) => ({ email: m.email.toLowerCase(), role: m.role })),
  ];
}

export async function assignWork(params: {
  business: { id: string; ownerEmail: string | null };
  kind: "request" | "job";
  id: string;
  email: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const email = params.email?.trim().toLowerCase() || null;
  if (email && !(await workAssignees(params.business)).some((a) => a.email === email)) {
    return { ok: false, status: 400, error: "That person isn't on your team. Invite them in Settings → Team first." };
  }
  const where = { id: params.id, businessId: params.business.id };
  const updated =
    params.kind === "request"
      ? await prisma.lead.updateMany({ where, data: { assigneeEmail: email } })
      : await prisma.job.updateMany({ where, data: { assigneeEmail: email } });
  if (updated.count === 0) return { ok: false, status: 404, error: "That work item is gone." };
  return { ok: true };
}

/** One piece of work as Work sees it, problems included; finished work comes back without them. */
export async function getWorkItem(businessId: string, kind: "request" | "job", id: string, now = new Date()): Promise<WorkItem | null> {
  const key = `${kind}:${id}`;
  if (kind === "request") {
    const job = await prisma.job.findFirst({ where: { businessId, leadId: id }, select: { id: true } });
    if (job) return getWorkItem(businessId, "job", job.id, now);
  }
  const open = await listWork(businessId, "open", now);
  const found = open.items.find((i) => i.key === key);
  if (found) return found;
  if (kind === "job") {
    const row = await prisma.job.findFirst({ where: { id, businessId }, select: jobSelect });
    return row ? jobWorkItem(row, now.getTime()) : null;
  }
  const row = await prisma.lead.findFirst({ where: { id, businessId }, select: requestSelect });
  return row ? requestWorkItem(row) : null;
}
