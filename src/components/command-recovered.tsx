"use client";

import Link from "next/link";
import { buildRecoveredWeek } from "@/lib/recovered-week";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

export function CommandRecovered({ outcomes }: { outcomes: ShopOutcomes | undefined }) {
  if (!outcomes) {
    return (
      <section className="op-panel rw-panel font-sans" aria-label="Recovered this week" aria-busy="true">
        <header className="op-head">
          <p className="op-title">Recovered this week</p>
        </header>
        <div className="op-skel">
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      </section>
    );
  }

  const week = buildRecoveredWeek(outcomes);
  return (
    <section className="op-panel rw-panel font-sans" aria-label="Recovered this week">
      <header className="op-head">
        <p className="op-title">Recovered this week</p>
        {week.headline?.estimate ? <span className="op-fresh">Estimate</span> : null}
      </header>

      {week.headline ? (
        <p className="rw-headline">
          <span className="rw-headline-value">{week.headline.value}</span>
          <span className="rw-headline-label">{week.headline.label}</span>
        </p>
      ) : (
        <p className="rw-empty">Nothing captured yet this week. Every call Orvius answers lands here.</p>
      )}

      <dl className="rw-rows">
        {week.rows.map((row) => (
          <div key={row.label} className="rw-row">
            <dt>{row.label}</dt>
            <dd>
              {row.value}
              {row.detail ? <span className="rw-detail">{row.detail}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      {week.needsTicket ? (
        <Link href="/dashboard?settings=receptionist" className="ox-btn ox-btn--quiet ox-btn--sm rw-action">
          Set your average ticket to see dollars
        </Link>
      ) : null}
    </section>
  );
}
