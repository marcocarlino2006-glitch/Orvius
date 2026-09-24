import { RecordLink } from "@/components/record-drawer";
import { ShellBadge } from "@/components/shell-primitives";
import { displayPhone, normalizePhone } from "@/lib/customer";
import { jobStatusLabel } from "@/lib/job-status";
import { isEmergency } from "@/lib/urgency";

type JobCardProps = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  address?: string | null;
  customerName?: string | null;
  phone?: string | null;
  urgency?: string | null;
  technicianName?: string | null;
};

function statusTone(status: string) {
  if (status === "confirmed" || status === "en_route" || status === "on_site") {
    return "live" as const;
  }
  if (status === "completed") return "neutral" as const;
  if (status === "cancelled") return "muted" as const;
  return "neutral" as const;
}

/** Cursor-grade job row — dense rail, not a soft card. */
export function JobCard({
  id,
  title,
  status,
  scheduledAt,
  address,
  customerName,
  phone,
  urgency,
  technicianName,
}: JobCardProps) {
  const emergency = isEmergency(urgency);
  const phoneLabel = phone
    ? displayPhone(normalizePhone(phone) ?? phone)
    : null;
  const when = scheduledAt
    ? new Date(scheduledAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Unscheduled";

  return (
    <RecordLink
      type="job"
      id={id}
      href={`/dashboard/jobs/${id}`}
      className={`lead-rail-row job-rail-row${emergency ? " lead-rail-row-emergency" : ""}`}
    >
      <div className="lead-rail-main">
        <div className="lead-rail-meta">
          {/*
            The kicker says why this row wants attention, the badge beside the
            title says what state it is in. Naming the status here as well put
            "Emergency · scheduled" above a SCHEDULED pill on the same row —
            and "JOB", on the jobs list, said nothing at all.
          */}
          {emergency ? (
            <p className="lead-rail-kind is-flare">Emergency</p>
          ) : null}
          <time className="lead-rail-time">{when}</time>
        </div>
        <div className="lead-rail-title-row">
          <span className="lead-rail-name">{title}</span>
          <div className="lead-rail-badges">
            <ShellBadge tone={statusTone(status)}>{jobStatusLabel(status)}</ShellBadge>
          </div>
        </div>
        <p className="lead-rail-sub">
          {customerName ?? "Customer"}
          {phoneLabel ? ` · ${phoneLabel}` : ""}
          {technicianName ? ` · ${technicianName}` : ""}
          {address ? ` · ${address}` : ""}
        </p>
      </div>
    </RecordLink>
  );
}
