import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";
import type { TimelineEvent } from "@/lib/customer";
import { isEmergency, notableUrgency } from "@/lib/urgency";

/*
  Colour on this timeline means urgency, not what kind of record it is.

  It used to mean both, and the fallback arm of this switch was `flare` — so
  every lead on a customer's history wore the colour the product reserves for a
  burst pipe. One record had twenty-three emergency-red pills on it and two of
  them were emergencies. A payment stays green because money arriving is the
  one event type that is itself good news.
*/
function badgeTone(type: TimelineEvent["type"]) {
  return type === "payment" ? ("live" as const) : ("muted" as const);
}

export function CustomerTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return (
      <p className="font-sans text-sm text-ash">
        No interactions yet. Calls, jobs, estimates, and payments will appear here.
      </p>
    );
  }

  return (
    <ol className="customer-timeline">
      {events.map((event, index) => (
        <li key={`${event.type}-${event.id}`} className="customer-timeline-item">
          <div className="customer-timeline-marker" aria-hidden />
          <div className="customer-timeline-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-sans text-sm font-semibold text-void">
                  {event.title}
                </p>
                <p className="mt-1 font-sans text-xs text-ash">
                  {new Date(event.at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {/*
                    The source is only worth printing when it is not the type
                    said again. It is hardcoded to the type for calls, jobs,
                    estimates, invoices and payments, so this line read
                    "Sep 11, 7:43 AM · call · completed" beside a CALL pill
                    above a "View call →" link — the same word three times.
                    A lead is the exception: its source is the channel it came
                    in on, so an SMS lead still says so.
                  */}
                  {event.source && event.source !== event.type
                    ? ` · ${event.source}`
                    : ""}
                  {event.status ? ` · ${event.status}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ShellBadge tone={badgeTone(event.type)}>{event.type}</ShellBadge>
                {isEmergency(event.urgency) ? (
                  <ShellBadge tone="flare">Emergency</ShellBadge>
                ) : notableUrgency(event.urgency) ? (
                  <ShellBadge tone="neutral">
                    {notableUrgency(event.urgency)}
                  </ShellBadge>
                ) : null}
              </div>
            </div>
            {event.summary ? (
              <p className="mt-3 font-sans text-sm leading-relaxed text-ash">
                {event.summary}
              </p>
            ) : null}
            {event.type === "lead" ? (
              <Link
                href={`/dashboard/inbox/${event.id}`}
                className="customer-timeline-link font-sans"
              >
                View lead →
              </Link>
            ) : null}
            {event.type === "call" ? (
              <Link
                href={`/dashboard/calls/${event.id}`}
                className="customer-timeline-link font-sans"
              >
                View call →
              </Link>
            ) : null}
            {event.type === "job" ? (
              <Link
                href={`/dashboard/jobs/${event.id}`}
                className="customer-timeline-link font-sans"
              >
                View job →
              </Link>
            ) : null}
          </div>
          {index < events.length - 1 ? (
            <span className="customer-timeline-line" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
