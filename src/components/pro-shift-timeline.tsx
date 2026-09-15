"use client";

import Link from "next/link";
import { formatCentsExact } from "@/lib/money";
import { buildPipelineProof } from "@/lib/pipeline-proof";
import type { ShiftEvent } from "@/lib/shift-timeline";

const LABELS: Record<ShiftEvent["kind"], string> = {
  call_captured: "Call captured",
  lead_captured: "Demand captured",
  job_booked: "Job booked",
  job_completed: "Job completed",
  owner_alerted: "Owner alerted",
  deposit_sent: "Deposit requested",
  deposit_paid: "Deposit paid",
  payment_recorded: "Payment recorded",
};

function eventTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ProShiftTimeline({
  events,
  loading = false,
  moneyEnabled = false,
  setupReady = false,
}: {
  events: ShiftEvent[];
  loading?: boolean;
  moneyEnabled?: boolean;
  setupReady?: boolean;
}) {
  const visible = events.slice(0, 6);
  const proof = buildPipelineProof(events, moneyEnabled);
  const provenCount = proof.filter((stage) => stage.state === "proven").length;

  return (
    <section className="pro-shift" aria-labelledby="pro-shift-title">
      <header className="pro-shift-head">
        <div>
          <p className="pro-shift-kicker font-sans">Live operating record</p>
          <h2 id="pro-shift-title" className="pro-shift-title font-sans">
            Orvius shift timeline
          </h2>
        </div>
        <span className="pro-shift-window font-sans">Last 24 hours</span>
      </header>

      {!loading ? (
        <div className="pro-shift-proof font-sans" aria-label="Core loop proof">
          <div className="pro-shift-proof-head">
            <p>
              Core loop <strong>{provenCount}/5 measured</strong>
            </p>
            <span>No simulated wins</span>
          </div>
          <ol>
            {proof.map((stage) => (
              <li key={stage.id} data-state={stage.state}>
                <span aria-hidden />
                {stage.label}
                {stage.state === "optional" ? <small>Optional</small> : null}
              </li>
            ))}
          </ol>
          {!setupReady ? (
            <Link href="/dashboard/settings">
              Finish setup before testing the full loop →
            </Link>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="pro-shift-loading" aria-label="Loading shift activity">
          <span />
          <span />
          <span />
        </div>
      ) : visible.length === 0 ? (
        <div className="pro-shift-empty">
          <p className="font-sans">The line is on watch.</p>
          <span className="font-sans">
            Captured calls, bookings, alerts and money will leave an evidence
            trail here.
          </span>
        </div>
      ) : (
        <ol className="pro-shift-list">
          {visible.map((event, index) => {
            const content = (
              <>
                <span
                  className={`pro-shift-marker pro-shift-marker--${event.tone}`}
                  aria-hidden
                />
                {index < visible.length - 1 ? (
                  <span className="pro-shift-line" aria-hidden />
                ) : null}
                <div className="pro-shift-copy">
                  <div className="pro-shift-meta font-sans">
                    <span
                      className={`pro-shift-label pro-shift-label--${event.tone}`}
                    >
                      {LABELS[event.kind]}
                    </span>
                    <time dateTime={event.at}>{eventTime(event.at)}</time>
                  </div>
                  <p className="pro-shift-event-title font-sans">{event.title}</p>
                  {event.detail ? (
                    <p className="pro-shift-detail font-sans">{event.detail}</p>
                  ) : null}
                </div>
                {event.amountCents != null ? (
                  <strong className="pro-shift-amount font-sans">
                    {formatCentsExact(event.amountCents)}
                  </strong>
                ) : null}
              </>
            );

            return (
              <li key={event.key}>
                {event.href ? (
                  <Link href={event.href} className="pro-shift-event">
                    {content}
                  </Link>
                ) : (
                  <div className="pro-shift-event">{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {!loading && events.length > visible.length ? (
        <p className="pro-shift-more font-sans">
          Showing the latest {visible.length} of {events.length} measured events.
        </p>
      ) : null}
    </section>
  );
}
