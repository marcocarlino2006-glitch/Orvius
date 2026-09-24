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
};

export type SignalTone = "neutral" | "success" | "attention" | "risk";

export type CommandSignal = {
  id: "demand" | "qualified" | "motion" | "attention" | "risk";
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

export function buildCommandSignals(
  counts: CommandCounts,
  work: WorkItem[],
): CommandSignal[] {
  const demand = counts.calls + counts.messagesAndWeb;
  const critical = work.filter((w) => w.severity === "critical").length;
  const risk = revenueAtRiskCents(work);
  const window = `last ${counts.windowDays} days`;

  return [
    {
      id: "demand",
      label: "New demand",
      value: String(demand),
      detail:
        demand === 0
          ? `No calls or messages ${window}`
          : `${plural(counts.calls, "call")} · ${plural(counts.messagesAndWeb, "message")}`,
      href: "/dashboard/calls",
      tone: "neutral",
    },
    {
      id: "qualified",
      label: "Qualified",
      value: String(counts.qualified),
      detail:
        counts.qualified === 0
          ? "None yet — service + contact not captured"
          : `${counts.booked} booked into jobs`,
      href: "/dashboard/inbox",
      tone: counts.qualified > 0 ? "success" : "neutral",
    },
    {
      id: "motion",
      label: "Jobs in motion",
      value: String(counts.jobsInMotion),
      detail:
        counts.jobsInMotion === 0
          ? "No open jobs"
          : counts.jobsUnassigned > 0
            ? `${counts.jobsUnassigned} unassigned`
            : "All assigned",
      href: counts.jobsUnassigned > 0 ? "/dashboard/dispatch" : "/dashboard/jobs",
      tone: counts.jobsUnassigned > 0 ? "attention" : "neutral",
    },
    {
      id: "attention",
      label: "Needs you",
      value: String(work.length),
      detail:
        work.length === 0
          ? "Queue is clear"
          : critical > 0
            ? `${critical} critical`
            : "Nothing critical",
      href: "#work-queue",
      tone: critical > 0 ? "risk" : work.length > 0 ? "attention" : "success",
    },
    {
      id: "risk",
      label: "Revenue at risk",
      value: risk > 0 ? formatWholeDollars(risk) : counts.avgTicketSet ? "None" : "Not set",
      detail:
        risk > 0
          ? "Estimated from open work × avg ticket"
          : counts.avgTicketSet
            ? "No open work carries value"
            : "Add average ticket in Settings",
      href: risk > 0 ? "#work-queue" : counts.avgTicketSet ? "#work-queue" : "/dashboard/settings#economics-baseline",
      tone: risk > 0 ? "risk" : "neutral",
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
