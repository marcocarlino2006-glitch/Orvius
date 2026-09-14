"use client";

import { formatCents, formatCentsExact } from "@/lib/money";
import { useState } from "react";

type EstimateState = {
  id: string;
  amountCents: number;
  status: string;
  publicToken?: string | null;
  invoice: {
    id: string;
    amountCents: number;
    status: string;
    payments: Array<{ id: string; amountCents: number; status: string }>;
  } | null;
} | null;

type DepositState = {
  id: string;
  amountCents: number;
  status: string;
  payUrl: string | null;
  sentAt: string | null;
  paidAt: string | null;
} | null;

type DepositReadiness =
  | { ready: true; amountCents: number }
  | { ready: false; reason: "connect_incomplete" | "deposits_off" };

type JobMoneyPanelProps = {
  jobId: string;
  avgTicketCents: number | null;
  estimate: EstimateState;
  leadId: string | null;
  customerPhone: string | null;
  deposit: DepositState;
  depositReadiness: DepositReadiness | null;
  onRefresh: () => void;
};

export function JobMoneyPanel({
  jobId,
  avgTicketCents,
  estimate,
  leadId,
  customerPhone,
  deposit,
  depositReadiness,
  onRefresh,
}: JobMoneyPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositCopied, setDepositCopied] = useState(false);
  const [depositNote, setDepositNote] = useState<string | null>(null);
  const [amountDollars, setAmountDollars] = useState(
    avgTicketCents ? String(Math.round(avgTicketCents / 100)) : "",
  );

  async function requestDeposit() {
    if (!leadId) return;
    setDepositBusy(true);
    setError(null);
    setDepositNote(null);
    try {
      const res = await fetch("/api/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, send: Boolean(customerPhone) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not request deposit");
      /*
        Whether the text actually left is the shop's problem to know about —
        reporting "texted" on a carrier rejection is how an owner ends up
        waiting on a deposit the customer was never asked for.
      */
      if (!customerPhone) {
        setDepositNote("Link created. Read it to the customer or copy it below.");
      } else if (data.sms?.sent) {
        setDepositNote("Deposit link texted to the customer.");
      } else {
        setDepositNote(
          "Link created, but the text did not send. Copy it below and pass it on.",
        );
      }
      onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not request deposit",
      );
    } finally {
      setDepositBusy(false);
    }
  }

  async function copyDepositLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setDepositCopied(true);
    } catch {
      setError("Could not copy — select the link manually");
    }
  }

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

  async function sendEstimate() {
    if (!estimate) return;
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/estimates/${estimate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send estimate");
      setShareUrl(data.shareUrl ?? null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send estimate");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setError("Could not copy — select the link manually");
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
      {error ? (
        <p className="os-own-color job-money-error">{error}</p>
      ) : null}

      {/*
        Booking deposit first, because chronologically it is first: it is asked
        for when the appointment is made, while the estimate below belongs to
        the visit itself.
      */}
      <div className="job-money-share">
        <p className="job-money-share-label">Booking deposit</p>

        {deposit ? (
          <>
            <p className="job-money-lead">
              {deposit.status === "paid"
                ? `${formatCentsExact(deposit.amountCents)} paid${
                    deposit.paidAt
                      ? ` on ${new Date(deposit.paidAt).toLocaleDateString()}`
                      : ""
                  }.`
                : `${formatCentsExact(deposit.amountCents)} requested${
                    deposit.sentAt ? " and texted" : ""
                  } — not paid yet.`}
            </p>
            {deposit.status !== "paid" && deposit.payUrl ? (
              <>
                <code className="job-money-share-url">{deposit.payUrl}</code>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  disabled={depositBusy}
                  onClick={() => void copyDepositLink(deposit.payUrl!)}
                >
                  {depositCopied ? "Copied" : "Copy deposit link"}
                </button>
              </>
            ) : null}
          </>
        ) : !depositReadiness ? (
          <p className="job-money-lead">Checking deposit settings…</p>
        ) : depositReadiness.ready && leadId ? (
          <>
            <p className="job-money-lead">
              {customerPhone
                ? `Text this customer a link to pay ${formatCentsExact(depositReadiness.amountCents)} and hold the slot.`
                : `Create a link for ${formatCentsExact(depositReadiness.amountCents)} to hold the slot. No phone on file, so it will not send itself.`}
            </p>
            <button
              type="button"
              className="btn btn-void text-sm"
              disabled={depositBusy}
              onClick={() => void requestDeposit()}
            >
              {depositBusy
                ? "Requesting…"
                : customerPhone
                  ? `Text ${formatCentsExact(depositReadiness.amountCents)} deposit link`
                  : `Create ${formatCentsExact(depositReadiness.amountCents)} deposit link`}
            </button>
          </>
        ) : (
          /*
            Two different unmet conditions, and the owner can only fix one of
            them per trip to Billing, so each says which one it is.
          */
          <p className="job-money-lead">
            {!depositReadiness.ready &&
            depositReadiness.reason === "connect_incomplete"
              ? "Connect a payout account on Billing to take deposits by card."
              : !depositReadiness.ready
                ? "Booking deposits are off. Turn them on under Billing to ask for one."
                : "Deposits attach to the call this job came from."}
          </p>
        )}

        {/*
          Held back until the deposit itself is on screen. Every wording of
          this note points at the link ("copy it below"), and the refresh that
          brings the link lands a beat after the request resolves — so shown
          eagerly it spends that beat pointing at nothing.
        */}
        {depositNote && deposit ? (
          <p className="job-money-lead">{depositNote}</p>
        ) : null}
      </div>

      {!estimate ? (
        <>
          {/*
            This used to say card payments settle on Orvius "until Connect".
            Connect shipped: estimate checkout is a direct charge on the shop's
            own account, so the money never touches ours. Telling an owner
            otherwise is the fastest way to lose them.
          */}
          <p className="job-money-lead">
            Draft an estimate, send a customer link to accept, then record
            payment manually. If the customer pays by card, the funds settle to
            your bank on Stripe&rsquo;s payout schedule — Orvius only takes its
            fee and never holds your money.
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

          <div className="job-money-actions">
            {estimate.status !== "accepted" || !estimate.publicToken ? (
              <button
                type="button"
                className="btn btn-void text-sm"
                disabled={busy}
                onClick={() => void sendEstimate()}
              >
                {busy ? "Working…" : estimate.publicToken ? "Refresh send link" : "Send to customer"}
              </button>
            ) : null}

            {shareUrl || estimate.publicToken ? (
              <div className="job-money-share">
                <p className="job-money-share-label">Customer link</p>
                <code className="job-money-share-url">
                  {shareUrl ??
                    (typeof window !== "undefined"
                      ? `${window.location.origin}/e/${estimate.publicToken}`
                      : `/e/${estimate.publicToken}`)}
                </code>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  disabled={busy}
                  onClick={() => {
                    if (shareUrl) {
                      void copyLink();
                    } else if (estimate.publicToken) {
                      const url = `${window.location.origin}/e/${estimate.publicToken}`;
                      setShareUrl(url);
                      void navigator.clipboard.writeText(url).then(
                        () => setCopied(true),
                        () => setError("Could not copy — select the link manually"),
                      );
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            ) : null}

            {!estimate.invoice ? (
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={busy}
                onClick={() => void createInvoice()}
              >
                {busy ? "Working…" : "Create invoice (internal)"}
              </button>
            ) : estimate.invoice.status !== "paid" ? (
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={busy}
                onClick={() => void recordPayment()}
              >
                {busy ? "Recording…" : "Record payment (manual)"}
              </button>
            ) : (
              <p className="text-sm text-ash">Paid in full.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
