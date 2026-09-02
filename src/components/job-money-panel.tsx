"use client";

import { formatCents } from "@/lib/money";
import { useState } from "react";

type EstimateState = {
  id: string;
  amountCents: number;
  status: string;
  invoice: {
    id: string;
    amountCents: number;
    status: string;
    payments: Array<{ id: string; amountCents: number; status: string }>;
  } | null;
} | null;

type JobMoneyPanelProps = {
  jobId: string;
  avgTicketCents: number | null;
  estimate: EstimateState;
  onRefresh: () => void;
};

export function JobMoneyPanel({
  jobId,
  avgTicketCents,
  estimate,
  onRefresh,
}: JobMoneyPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountDollars, setAmountDollars] = useState(
    avgTicketCents ? String(Math.round(avgTicketCents / 100)) : "",
  );

  async function createEstimate() {
    setBusy(true);
    setError(null);
    try {
      const amountCents = amountDollars.trim()
        ? Math.round(Number(amountDollars.replace(/[^0-9.]/g, "")) * 100)
        : undefined;
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          ...(amountCents && Number.isFinite(amountCents) ? { amountCents } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create estimate");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create estimate");
    } finally {
      setBusy(false);
    }
  }

  async function createInvoice() {
    if (!estimate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimateId: estimate.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create invoice");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invoice");
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment() {
    if (!estimate?.invoice) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: estimate.invoice.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not record payment");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="job-money font-sans">
      {error ? <p className="job-money-error">{error}</p> : null}

      {!estimate ? (
        <>
          <p className="job-money-lead">
            Draft an estimate from your average ticket, then convert to an invoice when the
            customer accepts.
          </p>
          <label className="mt-4 block">
            <span className="label">Amount ($)</span>
            <input
              className="input mt-1.5"
              inputMode="decimal"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              placeholder={avgTicketCents ? undefined : "e.g. 350"}
              disabled={busy}
            />
          </label>
          {!avgTicketCents && !amountDollars.trim() ? (
            <p className="mt-2 text-sm text-ash">
              Set an average ticket in Settings or enter an amount here.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-void mt-4 text-sm"
            disabled={busy || (!avgTicketCents && !amountDollars.trim())}
            onClick={() => void createEstimate()}
          >
            {busy ? "Creating…" : "Create estimate"}
          </button>
        </>
      ) : (
        <>
          <dl className="job-money-meta">
            <div>
              <dt>Estimate</dt>
              <dd>
                {formatCents(estimate.amountCents)} · {estimate.status}
              </dd>
            </div>
            {estimate.invoice ? (
              <div>
                <dt>Invoice</dt>
                <dd>
                  {formatCents(estimate.invoice.amountCents)} · {estimate.invoice.status}
                </dd>
              </div>
            ) : null}
          </dl>

          {!estimate.invoice ? (
            <button
              type="button"
              className="btn btn-void mt-4 text-sm"
              disabled={busy}
              onClick={() => void createInvoice()}
            >
              {busy ? "Working…" : "Create invoice from estimate"}
            </button>
          ) : estimate.invoice.status !== "paid" ? (
            <button
              type="button"
              className="btn btn-void mt-4 text-sm"
              disabled={busy}
              onClick={() => void recordPayment()}
            >
              {busy ? "Recording…" : "Record payment (manual)"}
            </button>
          ) : (
            <p className="mt-4 text-sm text-ash">Paid in full.</p>
          )}
        </>
      )}
    </div>
  );
}
