import Link from "next/link";
import type { TimelineEvent } from "@/lib/customer";
import { isEmergency, notableUrgency } from "@/lib/urgency";
import { formatWhen, statusWord } from "@/lib/when";

/*
  Colour on this timeline means urgency or money arriving, not what kind of
  record it is. Every row reads the same way as a job's history: what kind of
  thing, what it was, when.
*/
const KIND: Record<TimelineEvent["type"], string> = {
  call: "Call",
  lead: "Request",
  job: "Job",
  estimate: "Estimate",
  invoice: "Invoice",
  payment: "Payment",
};

function hrefFor(event: TimelineEvent): string | null {
  if (event.type === "lead") return `/dashboard/inbox/${event.id}`;
  if (event.type === "call") return `/dashboard/calls/${event.id}`;
  if (event.type === "job") return `/dashboard/jobs/${event.id}`;
  return null;
}

/** "Maria Lopez: AC not cooling" under a row titled "AC not cooling" says nothing new. */
function freshSummary(event: TimelineEvent): string | null {
  const summary = event.summary?.trim();
  if (!summary) return null;
  const title = event.title.trim().toLowerCase();
  return summary.toLowerCase().includes(title) ? null : summary;
}

export function CustomerTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return <p className="cmd-empty">Nothing yet. Calls, jobs, estimates and payments show up here.</p>;
  }

  return (
    <ol className="wh-list ct-list">
      {events.map((event) => {
        const href = hrefFor(event);
        const summary = freshSummary(event);
        const urgency = isEmergency(event.urgency) ? "Emergency" : notableUrgency(event.urgency) ? statusWord(notableUrgency(event.urgency)) : null;
        const meta = [event.source && event.source !== event.type && event.source !== "call" ? statusWord(event.source) : null, event.status ? statusWord(event.status) : null, urgency]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={`${event.type}-${event.id}`} className={`wh-event${isEmergency(event.urgency) ? " wh-event--failed" : ""}`}>
            <span className={`ct-kind${event.type === "payment" ? " ct-kind--money" : ""}`}>{KIND[event.type]}</span>
            <div className="wh-body">
              <p className="wh-event-title">{href ? <Link href={href}>{event.title}</Link> : event.title}</p>
              {meta || summary ? <p className="wh-event-detail">{[meta, summary].filter(Boolean).join(" — ")}</p> : null}
            </div>
            <time className="wh-at" dateTime={event.at}>
              {formatWhen(event.at)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
