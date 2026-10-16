"use client";

import { useCallback, useEffect, useState } from "react";
import { OsShell } from "@/components/os-shell";
import { formatCents } from "@/lib/money";
import { MIN_ESTIMATES_FOR_RATE, REPORT_PERIODS, type OwnerReport, type ReportPeriodId, type ReportRow } from "@/lib/owner-report-types";

type ReportResponse = { period: ReportPeriodId; start: string; end: string; previousStart: string; previousEnd: string; timezone: string; report: OwnerReport };

const money = (cents: number | null) => (cents == null ? "—" : (formatCents(cents) ?? "$0"));
const pct = (rate: number | null) => (rate == null ? "—" : `${Math.round(rate * 100)}%`);

type ProofResponse = {
  window: { days: number };
  outcomes: { closedLoops: number; leadSourcedJobs: { count: number } };
  causal: { measured: false; why: string };
  manual: { jobsNotFromAnInboundRequest: number; manualPayments: { count: number; cents: number } };
  costs: { voice: { cents: number; calls: number }; telephony: { cents: number }; texts: { cents: number; count: number } };
  missing: Array<{ what: string; count: number | null; note?: string }>;
};

const MISSING_LABEL: Record<string, string> = {
  calls_without_reported_cost: "calls with no cost reported by the voice provider",
  completed_jobs_without_a_recorded_completion: "jobs marked done without a recorded completion",
  jobs_without_a_link_to_the_record_of_truth: "jobs not linked to the system that owns your jobs",
};

function ProofPanel() {
  const [proof, setProof] = useState<ProofResponse | null>(null);
  useEffect(() => {
    fetch("/api/reports/proof?days=30", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setProof)
      .catch(() => setProof(null));
  }, []);
  if (!proof) return null;
  const gaps = proof.missing.filter((m) => m.count);
  return (
    <section className="tm-section" aria-label="What Orvius can show">
      <h2 className="tm-h">What Orvius can show, last {proof.window.days} days</h2>
      <ul className="rp-open">
        <li>
          <span className="rp-open-label">Closed loops: a caller&apos;s request, done and paid on that job</span>
          <span className="rp-open-money">{proof.outcomes.closedLoops}</span>
          <span className="rp-open-age">observed, not proof Orvius caused them</span>
        </li>
        <li>
          <span className="rp-open-label">Entered by your team: jobs not from a call, text or web request</span>
          <span className="rp-open-money">{proof.manual.jobsNotFromAnInboundRequest}</span>
          <span className="rp-open-age">plus {proof.manual.manualPayments.count} cash/check payments ({money(proof.manual.manualPayments.cents)})</span>
        </li>
        <li>
          <span className="rp-open-label">What your calls and texts cost Orvius</span>
          <span className="rp-open-money">{money(proof.costs.voice.cents + proof.costs.telephony.cents + proof.costs.texts.cents)}</span>
          <span className="rp-open-age">voice {money(proof.costs.voice.cents)} as reported; phone and texts estimated at list rate</span>
        </li>
      </ul>
      <p className="tm-help">{proof.causal.why}</p>
      {gaps.length ? <p className="tm-help">Missing: {gaps.map((m) => `${m.count} ${MISSING_LABEL[m.what] ?? m.what}`).join("; ")}.</p> : null}
    </section>
  );
}

function range(startIso: string, endIso: string, timezone: string) {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: timezone });
  const end = new Date(new Date(endIso).getTime() - 1);
  return `${fmt(new Date(startIso))} – ${fmt(end)}`;
}

function change(now: number, before: number) {
  if (!before) return now ? "Up from $0 in the period before." : null;
  const delta = Math.round(((now - before) / before) * 100);
  return `${delta >= 0 ? "Up" : "Down"} ${Math.abs(delta)}% on ${money(before)} in the period before.`;
}

function Breakdown({ title, rows, total, tech }: { title: string; rows: ReportRow[]; total: number; tech?: boolean }) {
  if (!rows.length) return null;
  return (
    <section className="tm-section" aria-label={title}>
      <h2 className="tm-h">{title}</h2>
      <div className="rp-table-wrap">
        <table className="rp-table">
          <thead>
            <tr>
              <th scope="col">{tech ? "Technician" : "Came in by"}</th>
              <th scope="col">Collected</th>
              <th scope="col">Share</th>
              {tech ? (
                <>
                  <th scope="col">Jobs done</th>
                  <th scope="col">Estimates won</th>
                </>
              ) : (
                <th scope="col">Payments</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row">{r.label}</th>
                <td>{money(r.collectedCents)}</td>
                <td>{total ? `${Math.round((r.collectedCents / total) * 100)}%` : "—"}</td>
                {tech ? (
                  <>
                    <td>{r.jobsCompleted ?? 0}</td>
                    <td>{r.estimatesSent ? `${r.estimatesWon ?? 0} of ${r.estimatesSent}` : "—"}</td>
                  </>
                ) : (
                  <td>{r.payments}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriodId>("this_month");
  const [data, setData] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((p: ReportPeriodId) => {
    setLoading(true);
    setError(null);
    fetch(`/api/reports?period=${p}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "The report didn't load. Try again.");
        return body as ReportResponse;
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "The report didn't load. Try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(period);
  }, [load, period]);

  const r = data?.report;

  return (
    <OsShell title="Reports" subtitle="What the shop brought in">
      <p className="pg-purpose font-sans">
        Money collected, who brought it in, how often estimates close, and where the paying work came from. Built from your
        own records: collected means a paid invoice or deposit, by card or recorded by hand, counted on the day it was paid.
      </p>

      <div className="rp-controls" role="group" aria-label="Period">
        {REPORT_PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`ox-btn ox-btn--sm ${p.id === period ? "ox-btn--solid" : "ox-btn--quiet"}`}
            aria-pressed={p.id === period}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
        <a className="ox-btn ox-btn--quiet ox-btn--sm rp-csv" href={`/api/reports?period=${period}&format=csv`}>
          Download CSV
        </a>
      </div>

      {error ? (
        <div className="ox-state ox-state--failure ox-state--inline" role="alert">
          <p className="ox-state-title">Report not loaded</p>
          <p className="ox-state-copy">{error}</p>
          <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => load(period)}>
            Retry
          </button>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="tm-loading" aria-busy>
          <span className="skeleton" style={{ width: "40%", height: 14 }} />
          <span className="skeleton" style={{ width: "70%", height: 14 }} />
        </div>
      ) : null}

      {r && data ? (
        <div aria-busy={loading}>
          <p className="rp-range font-sans">{range(data.start, data.end, data.timezone)}</p>
          <div className="rp-tiles">
            <div className="rp-tile">
              <p className="rp-k">Collected</p>
              <p className="rp-v">{money(r.collectedCents)}</p>
              <p className="rp-note">{change(r.collectedCents, r.previousCollectedCents) ?? `${r.payments} payments.`}</p>
            </div>
            <div className="rp-tile">
              <p className="rp-k">Average invoice</p>
              <p className="rp-v">{money(r.averageInvoiceCents)}</p>
              <p className="rp-note">Paid invoices only, deposits not included. {r.jobsCompleted} jobs marked done.</p>
            </div>
            <div className="rp-tile">
              <p className="rp-k">Estimate close rate</p>
              <p className="rp-v">{pct(r.estimates.closeRate)}</p>
              <p className="rp-note">
                {r.estimates.closeRate == null
                  ? `Shows after ${MIN_ESTIMATES_FOR_RATE} estimates go out in the period; ${r.estimates.sent} so far.`
                  : `${r.estimates.won} of ${r.estimates.sent} sent were accepted: ${money(r.estimates.wonCents)} of ${money(r.estimates.sentCents)}.`}
              </p>
            </div>
            <div className="rp-tile">
              <p className="rp-k">Calls that became jobs</p>
              <p className="rp-v">{pct(r.calls.bookedRate)}</p>
              <p className="rp-note">
                {r.calls.leads
                  ? `${r.calls.booked} of ${r.calls.leads} callers with a request have a job on the books.`
                  : "No caller requests in this period yet."}
              </p>
            </div>
            <div className="rp-tile">
              <p className="rp-k">Still to collect</p>
              <p className="rp-v">{r.stillToCollect.totalCents ? money(r.stillToCollect.totalCents) : "—"}</p>
              <p className="rp-note">
                {r.stillToCollect.count
                  ? `${r.stillToCollect.count} unpaid ${r.stillToCollect.count === 1 ? "bill" : "bills"}, whatever the period.`
                  : "Every bill is paid."}
              </p>
            </div>
          </div>

          {r.stillToCollect.invoices.length ? (
            <section className="tm-section" aria-label="Still to collect">
              <h2 className="tm-h">Still to collect</h2>
              <ul className="rp-open">
                {r.stillToCollect.invoices.slice(0, 10).map((i) => (
                  <li key={i.id}>
                    {i.jobId ? (
                      <a href={`/dashboard/jobs/${i.jobId}`} className="rp-open-label">
                        {i.label}
                      </a>
                    ) : (
                      <span className="rp-open-label">{i.label}</span>
                    )}
                    <span className="rp-open-money">{money(i.balanceCents)}</span>
                    <span className="rp-open-age">
                      {i.balanceCents < i.amountCents ? `of ${money(i.amountCents)} · ` : ""}
                      {i.agedDays === 0 ? "billed today" : i.agedDays === 1 ? "billed yesterday" : `billed ${i.agedDays} days ago`}
                    </span>
                  </li>
                ))}
              </ul>
              {r.stillToCollect.invoices.length > 10 ? (
                <p className="tm-help">Showing the 10 oldest of {r.stillToCollect.invoices.length}.</p>
              ) : null}
            </section>
          ) : null}

          {r.payments ? (
            <>
              <Breakdown title="By technician" rows={r.byTechnician} total={r.collectedCents} tech />
              <Breakdown title="Where the paying work came from" rows={r.bySource} total={r.collectedCents} />
              <p className="tm-help">
                Money is credited to the technician on the job, and to how that job first came in. Orvius doesn&apos;t know
                which ad a caller saw.
              </p>
            </>
          ) : (
            <div className="ox-state ox-state--inline">
              <p className="ox-state-title">Nothing collected in this period yet</p>
              <p className="ox-state-copy">
                When an invoice or deposit is paid, by card or marked paid by your team, it shows up here with the technician
                and where the job came from.
              </p>
            </div>
          )}
          <ProofPanel />
        </div>
      ) : null}
    </OsShell>
  );
}
