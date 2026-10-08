import type { AttentionItem } from "@/lib/attention-types";

/**
 * Command's five signals and the work queue, derived from records only.
 * Pure and client-safe so the same rules render on screen and run in tests.
 */

export type CommandCounts = {
  windowDays: number;
  calls: number;
  /** Leads that arrived without a call (SMS, web form). */
  messagesAndWeb: number;
  /** Leads with a service request and a way to reach the customer. */
  qualified: number;
  /** Leads in the window that were booked into a job. */
  booked: number;
  /** Jobs not completed or cancelled. */
  jobsInMotion: number;
  jobsUnassigned: number;
  /** False until the shop sets an average ticket — dollars are never guessed. */
  avgTicketSet: boolean;
  /** New requests nobody has answered and that aren't a job yet. */
  awaitingResponse?: number;
  /** Open jobs with a time in the next seven days. */
  upcomingJobs?: number;
};

export type SignalTone = "neutral" | "success" | "attention" | "risk";

export type CommandSignal = {
  id: "requests" | "upcoming" | "exceptions";
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: SignalTone;
};

export type WorkSeverity = "critical" | "high" | "normal";

export type WorkItem = {
  id: string;
  severity: WorkSeverity;
  /** Who the work is for, or the system that failed. */
  subject: string;
  /** What was asked for, or what went wrong. */
  request: string;
  kindLabel: string;
  createdAt: string;
  impactCents: number | null;
  /** Repeated failures folded into one incident. */
  occurrences: number;
  firstSeenAt: string;
  source: AttentionItem;
};

/** System failures that repeat per event — one incident, not N rows. */
const INCIDENT_KINDS = new Set<AttentionItem["kind"]>([
  "alert_failed",
  "deposit_delivery_failed",
  "alerts_muted",
]);

const INCIDENT_TITLE: Partial<Record<AttentionItem["kind"], string>> = {
  alert_failed: "Owner alerts are not delivering",
  deposit_delivery_failed: "Deposit links are not delivering",
  alerts_muted: "Owner alerts are muted",
};

function severityOf(item: AttentionItem): WorkSeverity {
  if (item.impact === "critical") return "critical";
  if (item.impact === "high") return "high";
  return "normal";
}

const SEVERITY_ORDER: Record<WorkSeverity, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

function subjectOf(item: AttentionItem): string {
  if (item.group?.label) return item.group.label;
  if (item.entityType === "shop") return "Your shop";
  return item.title.split(" · ")[0] || item.title;
}

function kindLabelOf(item: AttentionItem, subject: string): string {
  if (!item.title.startsWith(subject)) return item.title;
  return item.title.slice(subject.length).replace(/^[\s·—-]+/, "");
}

export function groupWorkItems(items: AttentionItem[]): WorkItem[] {
  const incidents = new Map<string, WorkItem>();
  const rows: WorkItem[] = [];

  for (const item of items) {
    const subject = subjectOf(item);
    const base: WorkItem = {
      id: item.id,
      severity: severityOf(item),
      subject,
      request: item.detail,
      kindLabel: kindLabelOf(item, subject),
      createdAt: item.createdAt,
      impactCents: item.estimatedRevenueCents ?? null,
      occurrences: 1 + (item.rolledUp ?? 0),
      firstSeenAt: item.createdAt,
      source: item,
    };

    if (!INCIDENT_KINDS.has(item.kind)) {
      rows.push(base);
      continue;
    }

    const existing = incidents.get(item.kind);
    if (!existing) {
      const incident: WorkItem = {
        ...base,
        id: `incident:${item.kind}`,
        subject: INCIDENT_TITLE[item.kind] ?? item.title,
        kindLabel: "Incident",
        occurrences: 1,
      };
      incidents.set(item.kind, incident);
      rows.push(incident);
      continue;
    }

    existing.occurrences += 1;
    if (item.createdAt > existing.createdAt) {
      existing.createdAt = item.createdAt;
      existing.request = item.detail;
      existing.source = item;
    }
    if (item.createdAt < existing.firstSeenAt) existing.firstSeenAt = item.createdAt;
    if (item.estimatedRevenueCents) {
      existing.impactCents = (existing.impactCents ?? 0) + item.estimatedRevenueCents;
    }
    if (SEVERITY_ORDER[severityOf(item)] < SEVERITY_ORDER[existing.severity]) {
      existing.severity = severityOf(item);
    }
  }

  for (const incident of incidents.values()) {
    if (incident.occurrences > 1) {
      incident.request = `${incident.occurrences} failures · latest: ${incident.request}`;
    }
  }

  return rows.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return a.source.rank - b.source.rank;
  });
}

export function revenueAtRiskCents(work: WorkItem[]): number {
  return work.reduce((sum, item) => sum + (item.impactCents ?? 0), 0);
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatWholeDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/*
  What needs attention, in three counts read straight from records. No dollar
  figure sits here: an "at risk" number built from average tickets is a guess,
  and next to real counts it reads as money already lost.
*/
export function buildCommandSignals(
  counts: CommandCounts,
  work: WorkItem[],
): CommandSignal[] {
  const awaiting = counts.awaitingResponse ?? 0;
  const upcoming = counts.upcomingJobs ?? 0;
  const exceptions = work.filter((w) => w.severity === "critical" || w.severity === "high");
  const failures = exceptions.filter((w) => w.source.entityType === "shop").length;

  return [
    {
      id: "requests",
      label: "Requests awaiting a response",
      value: String(awaiting),
      detail: awaiting === 0 ? "Every new request has an answer" : "New calls, texts and web requests nobody has answered",
      href: "/dashboard/inbox",
      tone: awaiting > 0 ? "attention" : "neutral",
    },
    {
      id: "upcoming",
      label: "Upcoming jobs",
      value: String(upcoming),
      detail:
        upcoming === 0
          ? "Nothing booked in the next 7 days"
          : counts.jobsUnassigned > 0
            ? `Next 7 days · ${counts.jobsUnassigned} open ${counts.jobsUnassigned === 1 ? "job has" : "jobs have"} nobody assigned`
            : "Next 7 days · everyone assigned",
      href: "/dashboard/schedule",
      tone: counts.jobsUnassigned > 0 ? "attention" : "neutral",
    },
    {
      id: "exceptions",
      label: "Exceptions",
      value: String(exceptions.length),
      detail:
        exceptions.length === 0
          ? "No safety calls, failures or overdue work"
          : failures
            ? `${plural(failures, "system failure")} · ${plural(exceptions.length - failures, "urgent item")}`
            : "Safety calls, overdue work and held requests",
      href: "/dashboard/work",
      tone: exceptions.some((w) => w.severity === "critical") ? "risk" : exceptions.length ? "attention" : "neutral",
    },
  ];
}

export function formatAge(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatFreshness(at: number | null, now = Date.now()): string {
  if (!at) return "Not loaded yet";
  const sec = Math.max(0, Math.round((now - at) / 1000));
  if (sec < 10) return "Updated just now";
  if (sec < 60) return `Updated ${sec}s ago`;
  const min = Math.round(sec / 60);
  return `Updated ${min}m ago`;
}
