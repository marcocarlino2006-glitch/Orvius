"use client";

import Link from "next/link";
import { buildReceptionistCard, type ReceptionistWeek } from "@/lib/receptionist-week";

export function CommandReceptionist({ week }: { week: ReceptionistWeek | undefined }) {
  if (!week) {
    return (
      <section className="op-panel rc-panel font-sans" aria-label="Your receptionist this week" aria-busy="true">
        <header className="op-head">
          <p className="op-title">Your receptionist this week</p>
        </header>
        <div className="op-skel">
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      </section>
    );
  }

  const card = buildReceptionistCard(week);
  return (
    <section className="op-panel rc-panel font-sans" aria-label="Your receptionist this week">
      <header className="op-head">
        <p className="op-title">Receptionist this week</p>
        <Link href="/dashboard/calls" className="rc-link">
          Every call
        </Link>
      </header>

      {card.headline ? (
        <div className="rw-headline">
          <span className="rw-headline-value">{card.headline.value}</span>
          <span className="rw-headline-label">{card.headline.label}</span>
        </div>
      ) : (
        <p className="rw-empty">No callers yet this week. Every call it answers lands here.</p>
      )}

      {card.bookedShare != null ? (
        <div
          className="rc-bar"
          role="img"
          aria-label={`${week.booked} of ${week.realCallers} real callers booked`}
        >
          <span className="rc-bar-fill" style={{ width: `${Math.max(card.bookedShare * 100, week.booked ? 3 : 0)}%` }} />
        </div>
      ) : null}

      <dl className="rw-rows">
        {card.rows.map((row) => (
          <div key={row.label} className="rw-row">
            <dt>{row.label}</dt>
            <dd>
              {row.value}
              {row.detail ? <span className="rw-detail">{row.detail}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
