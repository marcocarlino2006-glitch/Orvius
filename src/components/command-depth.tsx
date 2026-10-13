"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CommandFlow, CommandMoney } from "@/lib/command-depth";
import type { CrewBlock, CrewBoard as CrewBoardData } from "@/lib/ring1-context";
import { formatCents } from "@/lib/money";

function clock(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

const BLOCK_MIN = "6.5rem";

const STEP_LABEL: Record<CrewBlock["step"], string> = {
  completed: "Done",
  on_site: "On site",
  en_route: "On the way",
  accepted: "Accepted",
  waiting_tech: "Not accepted yet",
};

/** Every step a job has to pass, with how many got there and what is stuck before it. */
export function FlowStrip({ flow }: { flow: CommandFlow | undefined }) {
  if (!flow) return null;
  const top = Math.max(1, ...flow.stages.map((s) => s.count));
  return (
    <section className="cmd-flow" aria-labelledby="cmd-flow-title">
      <div className="cmd-section-head">
        <h3 id="cmd-flow-title" className="cmd-section-title">
          How work is moving
        </h3>
        <span className="cmd-section-note">
          Last {flow.windowDays} days{flow.capped ? " · at least" : ""}
        </span>
      </div>
      <ol className="cmd-flow-stages">
        {flow.stages.map((stage) => (
          <li key={stage.key} className={`cmd-flow-stage${stage.waiting ? " has-waiting" : ""}`}>
            <Link href={stage.href} className="cmd-flow-link">
              <span className="cmd-flow-label">{stage.label}</span>
              <span className="cmd-flow-count">{stage.count}</span>
              <span className="cmd-flow-bar" aria-hidden>
                <span style={{ width: `${(stage.count / top) * 100}%` }} />
              </span>
              <span className="cmd-flow-wait">{stage.waitingLabel ?? "Nothing stuck"}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Billed, collected and still owed, read from invoices and payments. */
export function MoneyLine({ money }: { money: CommandMoney | undefined }) {
  if (!money) return null;
  const nothing = !money.invoices && !money.payments && !money.outstandingInvoices && !money.doneNotBilled;
  return (
    <section className="cmd-money" aria-label="Money">
      <div className="cmd-money-cell">
        <span className="cmd-money-label">Collected · {money.windowDays} days</span>
        <span className="cmd-money-value">{formatCents(money.collectedCents)}</span>
        <span className="cmd-money-note">{money.payments ? `${money.payments} ${money.payments === 1 ? "payment" : "payments"}` : "No payments yet"}</span>
      </div>
      <div className="cmd-money-cell">
        <span className="cmd-money-label">Billed · {money.windowDays} days</span>
        <span className="cmd-money-value">{formatCents(money.invoicedCents)}</span>
        <span className="cmd-money-note">{money.invoices ? `${money.invoices} ${money.invoices === 1 ? "invoice" : "invoices"}` : "No invoices yet"}</span>
      </div>
      <Link href="/dashboard/work" className={`cmd-money-cell${money.outstandingCents ? " is-owed" : ""}`}>
        <span className="cmd-money-label">Still owed</span>
        <span className="cmd-money-value">{formatCents(money.outstandingCents)}</span>
        <span className="cmd-money-note">
          {money.outstandingInvoices ? `${money.outstandingInvoices} unpaid ${money.outstandingInvoices === 1 ? "invoice" : "invoices"}` : "Nothing unpaid"}
        </span>
      </Link>
      <Link href="/dashboard/jobs" className={`cmd-money-cell${money.doneNotBilled ? " is-owed" : ""}`}>
        <span className="cmd-money-label">Done, not billed</span>
        <span className="cmd-money-value">{money.doneNotBilled}</span>
        <span className="cmd-money-note">{money.doneNotBilled ? "Write the bill" : "Every finished job is billed"}</span>
      </Link>
      {nothing ? <p className="cmd-money-empty">Bills and payments show here as soon as a job is invoiced.</p> : null}
    </section>
  );
}

function techNow(blocks: CrewBlock[], nowMin: number | null, availability: string | null, offAllDay: boolean) {
  const at = blocks.find((b) => b.step === "on_site");
  if (at) return { tone: "on_site", text: `On site · ${at.title}` };
  const driving = blocks.find((b) => b.step === "en_route");
  if (driving) return { tone: "en_route", text: `On the way · ${driving.title}` };
  const open = blocks.filter((b) => b.step !== "completed");
  if (offAllDay) return { tone: "off", text: availability ?? "Off today" };
  if (!blocks.length) return { tone: "free", text: availability ?? "Free all day" };
  if (!open.length) return { tone: "done", text: "Done for today" };
  const late = nowMin != null ? open.find((b) => b.startMin < nowMin) : undefined;
  if (late) return { tone: "late", text: `Should have started ${clock(late.startMin)} · ${late.title}` };
  const next = open[0]!;
  return { tone: "next", text: `Next ${clock(next.startMin)} · ${next.title}` };
}

function minutesNow(dayStart: string) {
  return Math.round((Date.now() - new Date(dayStart).getTime()) / 60_000);
}

/** Where every technician is right now and what is left on their day, on one time axis. */
export function CrewBoard({ board }: { board: CrewBoardData | undefined }) {
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    if (!board?.isToday) return;
    const tick = () => setNowMin(minutesNow(board.dayStart));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [board?.isToday, board?.dayStart]);

  const axis = board?.window ?? { startMin: 7 * 60, endMin: 19 * 60 };
  const span = Math.max(60, axis.endMin - axis.startMin);
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.ceil(axis.startMin / 120) * 120; m <= axis.endMin; m += 120) out.push(m);
    return out;
  }, [axis.startMin, axis.endMin]);
  const pct = (m: number) => `${((m - axis.startMin) / span) * 100}%`;
  const nowShown = nowMin != null && nowMin >= axis.startMin && nowMin <= axis.endMin;

  if (!board) return <p className="cmd-empty">Reading the crew…</p>;
  if (!board.lanes.length) {
    return (
      <p className="cmd-empty">
        No technicians yet. <Link href="/dashboard/team">Add your crew</Link> and their day shows here.
      </p>
    );
  }

  const lane = (key: string, name: string, status: { tone: string; text: string }, blocks: ReactNode, href?: string) => (
    <div key={key} className="cmd-crew-lane" role="row">
      <div className="cmd-crew-who" role="rowheader">
        {href ? (
          <a href={href} className="cmd-crew-name" title={`Call ${name}`}>
            {name}
          </a>
        ) : (
          <span className="cmd-crew-name">{name}</span>
        )}
        <span className={`cmd-crew-now is-${status.tone}`}>{status.text}</span>
      </div>
      <div className="cmd-crew-track" role="cell">
        {ticks.map((t) => (
          <span key={t} className="cmd-crew-grid" style={{ left: pct(t) }} aria-hidden />
        ))}
        {blocks}
        {nowShown ? <span className="cmd-crew-nowline" style={{ left: pct(nowMin!) }} aria-hidden /> : null}
      </div>
    </div>
  );

  const width = (b: { startMin: number; endMin: number }) => `${Math.max(((b.endMin - b.startMin) / span) * 100, 3)}%`;
  /* Blocks have a readable minimum width; a late one slides left instead of past the edge. */
  const place = (b: { startMin: number; endMin: number }) => ({ left: `min(${pct(b.startMin)}, calc(100% - ${BLOCK_MIN}))`, width: width(b) });

  return (
    <div className="cmd-crew" role="table" aria-label="Crew today">
      <div className="cmd-crew-lane cmd-crew-axis" role="row">
        <span className="cmd-crew-who" role="columnheader" aria-label="Technician" />
        <div className="cmd-crew-track" role="columnheader" aria-label="Time of day">
          {ticks.map((t) => (
            <span key={t} className="cmd-crew-tick" style={{ left: pct(t) }}>
              {clock(t)}
            </span>
          ))}
          {nowShown ? (
            <span className="cmd-crew-nowtag" style={{ left: pct(nowMin!) }}>
              Now
            </span>
          ) : null}
        </div>
      </div>
      {board.unassigned.length
        ? lane(
            "open",
            "Unassigned",
            { tone: "late", text: `${board.unassigned.length} need${board.unassigned.length === 1 ? "s" : ""} a technician` },
            board.unassigned.map((u) => (
              <Link
                key={u.id}
                href={`/dashboard/jobs/${u.id}`}
                className="cmd-crew-block is-open"
                style={place(u)}
                title={`${u.title} · ${clock(u.startMin)} · no technician`}
              >
                <span className="cmd-crew-block-text">
                  <span className="cmd-crew-block-time">{clock(u.startMin)}</span>
                  <span>{u.title}</span>
                </span>
              </Link>
            )),
          )
        : null}
      {board.lanes.map((l) =>
        lane(
          l.technician.id,
          l.technician.name,
          techNow(l.blocks, nowMin, l.availability, l.offAllDay),
          l.blocks.map((b) => (
            <Link
              key={b.id}
              href={`/dashboard/jobs/${b.id}`}
              className={`cmd-crew-block is-${b.conflict ? "conflict" : b.step}${b.emergency ? " is-emergency" : ""}`}
              style={place(b)}
              title={[
                `${b.title} · ${clock(b.startMin)}–${clock(b.endMin)}`,
                STEP_LABEL[b.step],
                b.customerConfirmed ? "Customer confirmed" : "Customer hasn't confirmed",
                b.conflict,
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              <span className="cmd-crew-block-text">
                <span className="cmd-crew-block-time">{clock(b.startMin)}</span>
                <span>{b.title}</span>
              </span>
              {!b.customerConfirmed && b.step !== "completed" ? <i className="cmd-crew-unconfirmed" aria-label="Customer hasn't confirmed" /> : null}
            </Link>
          )),
          l.technician.phone ? `tel:${l.technician.phone}` : undefined,
        ),
      )}
      <p className="cmd-crew-key" aria-hidden>
        <span className="is-waiting_tech">Not accepted</span>
        <span className="is-accepted">Accepted</span>
        <span className="is-en_route">On the way</span>
        <span className="is-on_site">On site</span>
        <span className="is-completed">Done</span>
        <span className="is-unconfirmed">Customer hasn&apos;t confirmed</span>
      </p>
    </div>
  );
}
