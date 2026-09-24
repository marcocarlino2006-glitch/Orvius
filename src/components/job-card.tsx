import { RecordLink } from "@/components/record-drawer";
import { StatusDot } from "@/components/status-dot";
import { displayPhone, normalizePhone } from "@/lib/customer";
import type { JobRowFacts } from "@/lib/job-row";
import { isEmergency } from "@/lib/urgency";

export type JobTableRow = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  address?: string | null;
  customerName?: string | null;
  phone?: string | null;
  urgency?: string | null;
  facts: JobRowFacts;
};

const STATUS: Record<string, { label: string; tone: "live" | "good" | "neutral" | "muted" }> = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "live" },
  en_route: { label: "En route", tone: "live" },
  on_site: { label: "On site", tone: "live" },
  completed: { label: "Completed", tone: "good" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

function whenParts(iso: string | null) {
  if (!iso) return { day: "Unscheduled", time: "" };
  const at = new Date(iso);
  const today = new Date();
  const sameDay = at.toDateString() === today.toDateString();
  const day = sameDay ? "Today" : at.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return { day, time: at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) };
}

export function JobTable({ rows }: { rows: JobTableRow[] }) {
  return (
    <div className="dt dt--jobs font-sans" role="table" aria-label="Jobs">
      <div className="dt-head" role="row">
        <span role="columnheader">Job</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Technician</span>
        <span role="columnheader">Scheduled</span>
        <span role="columnheader" className="dt-num">Amount</span>
      </div>
      {rows.map((row) => {
        const status = STATUS[row.status] ?? { label: row.status, tone: "neutral" as const };
        const when = whenParts(row.scheduledAt);
        const phone = row.phone ? displayPhone(normalizePhone(row.phone) ?? row.phone) : null;
        const { facts } = row;
        return (
          <RecordLink key={row.id} type="job" id={row.id} href={`/dashboard/jobs/${row.id}`} className="dt-row" role="row">
            <span role="cell" className="dt-primary">
              <span className="dt-title">
                {isEmergency(row.urgency) ? <span className="dt-flag">Emergency</span> : null}
                {row.title}
              </span>
              <span className="dt-sub">
                {[row.customerName, phone, row.address].filter(Boolean).join(", ") || "No customer details yet"}
              </span>
              {facts.attention ? <span className="dt-attention">{facts.attention.reason}</span> : null}
            </span>
            <span role="cell">
              <StatusDot tone={status.tone}>{status.label}</StatusDot>
            </span>
            <span role="cell" className={facts.owner.missing ? "dt-risk" : ""}>
              {facts.owner.missing ? "Unassigned" : facts.owner.label}
            </span>
            <span role="cell" className="dt-when">
              <span>
                {when.day}
                {when.time ? <span className="dt-muted"> {when.time}</span> : null}
              </span>
              {facts.timing.tone !== "neutral" || row.status !== "completed" ? (
                <span className={`dt-sub is-${facts.timing.tone}`}>{facts.timing.label}</span>
              ) : null}
            </span>
            <span role="cell" className="dt-num">
              {facts.money.cents == null ? (
                <span className="dt-muted">—</span>
              ) : facts.money.kind === "expected" ? (
                <span className="dt-muted" title="Estimated from your average ticket">
                  ~{facts.money.label.replace(/^~|\s*expected$/g, "")}
                </span>
              ) : (
                <>
                  <span>{facts.money.label.replace(/\s.*$/, "")}</span>
                  <span className={`dt-sub${facts.money.kind === "due" ? " is-attention" : ""}`}>
                    {facts.money.kind === "paid" ? "Paid" : facts.money.kind === "due" ? "Due" : facts.money.kind === "final" ? "Final" : "Estimate"}
                  </span>
                </>
              )}
            </span>
          </RecordLink>
        );
      })}
    </div>
  );
}
