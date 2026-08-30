import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";

type JobCardProps = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  address?: string | null;
  customerName?: string | null;
  phone?: string | null;
  urgency?: string | null;
};

function statusTone(status: string) {
  if (status === "confirmed") return "live" as const;
  if (status === "completed") return "neutral" as const;
  if (status === "cancelled") return "flare" as const;
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
}: JobCardProps) {
  return (
    <Link href={`/dashboard/jobs/${id}`} className="customer-record-card">
      <div className="customer-record-head">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-serif text-xl tracking-[-0.03em] text-void">
              {title}
            </h3>
            <ShellBadge tone={statusTone(status)}>{status}</ShellBadge>
            {urgency ? (
              <ShellBadge
                tone={urgency.toLowerCase().includes("emergency") ? "flare" : "neutral"}
              >
                {urgency.replace(/-/g, " ")}
              </ShellBadge>
            ) : null}
          </div>
          <p className="mt-1 font-sans text-sm text-ash">
            {customerName ?? "Customer"}
            {phone ? ` · ${phone}` : ""}
          </p>
        </div>
      </div>

      <dl className="customer-record-meta font-sans">
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
          <div className="customer-record-wide">
            <dt>Address</dt>
            <dd>{address}</dd>
          </div>
        ) : null}
      </dl>
    </Link>
  );
}
