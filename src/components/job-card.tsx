import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";
import { jobStatusLabel } from "@/lib/job-status";

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
  return "flare" as const;
}

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
  const emergency = urgency?.toLowerCase().includes("emergency");

  return (
    <Link href={`/dashboard/jobs/${id}`} className="job-card pro-card">
      <div className="job-card-header">
        <div className="job-card-kicker-row">
          {emergency ? (
            <span className="live-dot live-dot-flare" aria-hidden />
          ) : (
            <span className="live-dot live-dot-green" aria-hidden />
          )}
          <p className={`pro-kicker ${emergency ? "pro-kicker-flare" : ""}`}>
            {emergency ? "Emergency" : "Scheduled job"}
          </p>
        </div>
        <div className="job-card-badges">
          <ShellBadge tone={statusTone(status)}>{jobStatusLabel(status)}</ShellBadge>
          {urgency && !emergency ? (
            <ShellBadge tone="neutral">{urgency.replace(/-/g, " ")}</ShellBadge>
          ) : null}
        </div>
      </div>

      <div className="job-card-body">
        <h3 className="job-card-title font-sans">{title}</h3>
        <p className="job-card-sub font-sans">
          {customerName ?? "Customer"}
          {phone ? ` · ${phone}` : ""}
          {technicianName ? ` · ${technicianName}` : ""}
        </p>

        <dl className="job-card-meta font-sans">
          <div>
            <dt>Scheduled</dt>
            <dd>
              {scheduledAt
                ? new Date(scheduledAt).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Unscheduled"}
            </dd>
          </div>
          {address ? (
            <div className="job-card-meta-wide">
              <dt>Address</dt>
              <dd>{address}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    </Link>
  );
}
