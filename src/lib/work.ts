import { prisma } from "@/lib/prisma";

/*
  Work is one list of everything a shop has to do for a customer, from the
  first call to the last payment. A request that is not booked yet (a lead
  with no job) and a booked job are the same work item at different stages;
  booking moves it forward, it does not turn it into something else.

  Leads and jobs stay separate tables underneath, because a job still means
  "booked" everywhere the shop's numbers are counted. This module is the one
  place that reads both as Work, so every screen agrees on the stage, the
  person responsible and the next action.
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
  assigneeEmail: string | null;
  technician: { id: string; name: string } | null;
  customer: { name: string | null; phone: string | null } | null;
  invoices: Array<{ status: string; paidAt: Date | null; amountCents: number }>;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkItem = {
  /** The job's id once booked, the request's id before; stable as long as the stage is. */
  key: string;
  kind: "request" | "job";
  id: string;
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
  nextAction: string | null;
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

const unpaid = (job: Pick<WorkJob, "invoices">) => job.invoices.some((i) => !i.paidAt && i.status !== "void" && i.status !== "paid");

function responsibleFor(
  assigneeEmail: string | null,
  technician: { name: string } | null,
  fieldStage: boolean,
): WorkItem["responsible"] {
  if (assigneeEmail) return { kind: "teammate", label: assigneeEmail, email: assigneeEmail };
  if (technician && fieldStage) return { kind: "technician", label: technician.name, email: null };
  return { kind: "owner", label: "You", email: null };
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
  return {
    key: `request:${lead.id}`,
    kind: "request",
    id: lead.id,
    href: `/dashboard/inbox/${lead.id}`,
    title: lead.serviceType?.trim() || "New request",
    customer: lead.name,
    phone: lead.phone,
    address: lead.address,
    urgent: isUrgent(lead.urgency),
    stage,
    stageLabel: WORK_STAGE_LABEL[stage],
    open: OPEN_STAGES.has(stage),
    responsible: responsibleFor(lead.assigneeEmail, null, false),
    nextAction,
    scheduledAt: null,
    updatedAt: lead.updatedAt.toISOString(),
    createdAt: lead.createdAt.toISOString(),
  };
}

export function jobWorkItem(job: WorkJob): WorkItem {
  const stage = jobStage(job);
  const owes = unpaid(job);
  const nextAction = (() => {
    switch (stage) {
      case "needs_time":
        return "Set the time";
      case "scheduled":
        if (!job.technician) return "Assign a technician";
        return job.customerConfirmedAt ? null : "Confirm the time with the customer";
      case "confirmed":
        return job.technician ? null : "Assign a technician";
      case "on_the_way":
        return "Mark arrived";
      case "on_site":
        return "Mark done";
      case "done":
        return owes ? "Collect payment" : null;
      default:
        return null;
    }
  })();
  const fieldStage = stage !== "done" && stage !== "cancelled";
  return {
    key: `job:${job.id}`,
    kind: "job",
    id: job.id,
    href: `/dashboard/jobs/${job.id}`,
    title: job.title,
    customer: job.customer?.name ?? null,
    phone: job.customer?.phone ?? null,
    address: job.address,
    urgent: isUrgent(job.urgency),
    stage,
    stageLabel: WORK_STAGE_LABEL[stage],
    open: OPEN_STAGES.has(stage) || (stage === "done" && owes),
    responsible: responsibleFor(job.assigneeEmail, job.technician, fieldStage),
    nextAction,
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
    updatedAt: job.updatedAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
  };
}

const STAGE_ORDER = new Map(WORK_STAGES.map((s, i) => [s, i]));

/** Urgent first, then the earliest stage, then the oldest item or the soonest visit. */
export function sortWork(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    if (Boolean(a.nextAction) !== Boolean(b.nextAction)) return a.nextAction ? -1 : 1;
    const stage = STAGE_ORDER.get(a.stage)! - STAGE_ORDER.get(b.stage)!;
    if (stage) return stage;
    const at = (i: WorkItem) => Date.parse(i.scheduledAt ?? i.createdAt);
    return at(a) - at(b);
  });
}

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
  assigneeEmail: true,
  createdAt: true,
  updatedAt: true,
  technician: { select: { id: true, name: true } },
  customer: { select: { name: true, phone: true } },
  invoices: { select: { status: true, paidAt: true, amountCents: true } },
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
} as const;

export type WorkView = "open" | "closed";

/** One shop's Work. Open is everything with a next step; closed is the last 30 days of finished, cancelled and spam. */
export async function listWork(businessId: string, view: WorkView = "open", now = new Date()) {
  const since = new Date(now.getTime() - CLOSED_WINDOW_MS);
  const [requests, jobs] = await Promise.all([
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
                { status: "completed", invoices: { some: { paidAt: null, status: { notIn: ["void", "paid"] } } } },
              ],
            }
          : { businessId, status: { in: ["completed", "cancelled"] }, updatedAt: { gte: since } },
      select: jobSelect,
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
  ]);
  const items = [...requests.map(requestWorkItem), ...jobs.map(jobWorkItem)].filter((i) => (view === "open" ? i.open : !i.open));
  return {
    items: view === "open" ? sortWork(items) : items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    truncated: requests.length === LIMIT || jobs.length === LIMIT,
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
