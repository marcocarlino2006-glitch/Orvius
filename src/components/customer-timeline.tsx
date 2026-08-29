import Link from "next/link";
import { ShellBadge } from "@/components/shell-primitives";
import type { TimelineEvent } from "@/lib/customer";

export function CustomerTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return (
      <p className="font-sans text-sm text-ash">
        No interactions yet. Calls and leads will appear here.
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
                  {event.source ? ` · ${event.source}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ShellBadge tone={event.type === "call" ? "live" : "flare"}>
                  {event.type}
                </ShellBadge>
                {event.urgency ? (
                  <ShellBadge
                    tone={
                      event.urgency.toLowerCase() === "emergency"
                        ? "flare"
                        : "neutral"
                    }
                  >
                    {event.urgency.replace(/-/g, " ")}
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
          </div>
          {index < events.length - 1 ? (
            <span className="customer-timeline-line" aria-hidden />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
