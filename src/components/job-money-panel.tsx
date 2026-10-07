"use client";

import { toast } from "@/components/toaster";
import { DEFAULT_OPTION_LABELS, ESTIMATE_OPTION_KEYS, findOption, parseEstimateOptions } from "@/lib/estimate-options";
import { formatCents, formatCentsExact } from "@/lib/money";
import { useState } from "react";
import { formatDay, statusWord } from "@/lib/when";

type EstimateState = {
  id: string;
  amountCents: number;
  status: string;
  optionsJson?: string | null;
  chosenOption?: string | null;
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
  /** A finished visit never asks for a deposit to hold the slot. */
  jobClosed?: boolean;
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
  jobClosed = false,
  onRefresh,
}: JobMoneyPanelProps) {
  const settled = estimate?.invoice?.status === "paid";
  const showDeposit = Boolean(deposit) || (!jobClosed && !settled && depositReadiness?.ready === true);
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
  const [tiered, setTiered] = useState(false);
  const [tiers, setTiers] = useState(() =>
    ESTIMATE_OPTION_KEYS.map((key, i) => ({
      key,
      label: DEFAULT_OPTION_LABELS[key],
      description: "",
      dollars: i === 0 && avgTicketCents ? String(Math.round(avgTicketCents / 100)) : "",
    })),
  );
  const options = parseEstimateOptions(estimate?.optionsJson);
  const chosen = findOption(options, estimate?.chosenOption);
  const pricedTiers = tiers
    .map((t) => ({ ...t, amountCents: Math.round(Number(t.dollars.replace(/[^0-9.]/g, "")) * 100) }))
    .filter((t) => t.dollars.trim() && Number.isFinite(t.amountCents) && t.amountCents > 0);

  function setTier(index: number, patch: Partial<(typeof tiers)[number]>) {
    setTiers((current) => current.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

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
      const link = data.created ? "Link created" : "Same link kept";
      if (!customerPhone) {
        setDepositNote(`${link}. Read it to the customer or copy it above.`);
      } else if (data.sms?.sent) {
        setDepositNote("Deposit link texted to the customer.");
      } else {
        setDepositNote(
          `${link}, but the text did not send. Copy it above and pass it on.`,
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
      toast({ title: "Deposit link copied" });
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
        body: JSON.stringify(
          tiered
            ? {
                jobId,
                options: pricedTiers.map((t) => ({
                  label: t.label,
                  description: t.description,
                  amountCents: t.amountCents,
                })),
              }
            : {
                jobId,
                ...(amountCents && Number.isFinite(amountCents) ? { amountCents } : {}),
              },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create estimate");
      toast({ title: "Estimate drafted" });
      onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create estimate",
      );
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
      toast({ title: "Estimate ready. Copy the link to send it." });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send estimate");
    } finally {
      setBusy(false);
    }
  }

  async function chooseOption(key: string) {
    if (!estimate) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimates/${estimate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "choose", option: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the choice");
      toast({ title: `${data.option?.label ?? "Option"} chosen` });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the choice");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Estimate link copied" });
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
      toast({ title: "Invoice created" });
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
      {error ? <p className="os-own-color job-money-error">{error}</p> : null}

      {/*
        Booking deposit first, because chronologically it is first: it is asked
        for when the appointment is made, while the estimate below belongs to
        the visit itself.
      */}
      {showDeposit ? (
      <div className="job-money-share">
        <p className="job-money-share-label">Booking deposit</p>

        {deposit ? (
          <>
            <p className="job-money-lead">
              {deposit.status === "paid"
                ? `${formatCentsExact(deposit.amountCents)} paid${
                    deposit.paidAt
                      ? ` on ${formatDay(deposit.paidAt)}`
                      : ""
                  }.`
                : `${formatCentsExact(deposit.amountCents)} requested${
                    deposit.sentAt ? " and texted" : ""
                  } — not paid yet.`}
            </p>
            {deposit.status !== "paid" && deposit.payUrl ? (
              <>
                <code className="job-money-share-url">{deposit.payUrl}</code>
                <div className="job-money-actions">
                  {!deposit.sentAt && customerPhone ? (
                    <button
                      type="button"
                      className="btn btn-void text-sm"
                      disabled={depositBusy}
                      onClick={() => void requestDeposit()}
                    >
                      {depositBusy ? "Retrying…" : "Retry deposit text"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    disabled={depositBusy}
                    onClick={() => void copyDepositLink(deposit.payUrl!)}
                  >
                    {depositCopied ? "Copied" : "Copy deposit link"}
                  </button>
                </div>
              </>
            ) : null}
          </>
        ) : depositReadiness?.ready && leadId ? (
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
          <p className="job-money-lead">Deposits attach to the call this job came from.</p>
        )}

        {/*
          Held back until the deposit itself is on screen. Every wording of
          this note points at the link above it, and the refresh that brings
          the link lands a beat after the request resolves — so shown eagerly
          it spends that beat pointing at nothing.
        */}
        {depositNote && deposit ? (
          <p className="job-money-lead">{depositNote}</p>
        ) : null}
      </div>
      ) : null}

      {!estimate && jobClosed ? null : !estimate ? (
        <>
          {/*
            This used to say card payments settle on Orvius "until Connect".
            Connect shipped: estimate checkout is a direct charge on the shop's
            own account, so the money never touches ours. Telling an owner
            otherwise is the fastest way to lose them.
          */}
          <p className="job-money-lead">
            Send the customer an estimate to accept. Card payments go straight
            to your bank — Orvius never holds your money.
          </p>
          <div className="job-money-mode" role="radiogroup" aria-label="Estimate type">
            <button type="button" role="radio" aria-checked={!tiered} className={!tiered ? "is-on" : undefined} onClick={() => setTiered(false)}>
              One price
            </button>
            <button type="button" role="radio" aria-checked={tiered} className={tiered ? "is-on" : undefined} onClick={() => setTiered(true)}>
              Good · Better · Best
            </button>
          </div>
          {tiered ? (
            <div className="job-money-tiers">
              {tiers.map((t, i) => (
                <fieldset key={t.key} className="job-money-tier">
                  <legend className="sr-only">Option {i + 1}</legend>
                  <div className="job-money-tier-head">
                    <input
                      className="input"
                      aria-label={`Option ${i + 1} name`}
                      value={t.label}
                      maxLength={40}
                      onChange={(e) => setTier(i, { label: e.target.value })}
                      disabled={busy}
                    />
                    <input
                      className="input"
                      aria-label={`${t.label || `Option ${i + 1}`} price ($)`}
                      inputMode="decimal"
                      placeholder={["$", "$$", "$$$"][i]}
                      value={t.dollars}
                      onChange={(e) => setTier(i, { dollars: e.target.value })}
                      disabled={busy}
                    />
                  </div>
                  <input
                    className="input"
                    aria-label={`What ${t.label || `option ${i + 1}`} includes`}
                    placeholder={["Repair what failed", "Repair plus the part that fails next", "Replace the unit, 10-year warranty"][i]}
                    value={t.description}
                    maxLength={400}
                    onChange={(e) => setTier(i, { description: e.target.value })}
                    disabled={busy}
                  />
                </fieldset>
              ))}
              <p className="job-money-lead">
                The customer picks one on their link. Leave a price blank to offer two.
              </p>
            </div>
          ) : (
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
          )}
          <button
            type="button"
            className="btn btn-secondary mt-4 text-sm"
            disabled={
              busy ||
              (tiered ? pricedTiers.length < 2 || pricedTiers.some((t) => t.amountCents < 1000) : !avgTicketCents && !amountDollars.trim())
            }
            onClick={() => void createEstimate()}
          >
            {busy ? "Creating…" : tiered ? `Create estimate with ${pricedTiers.length >= 2 ? pricedTiers.length : "2–3"} options` : "Create estimate"}
          </button>
          {tiered && pricedTiers.some((t) => t.amountCents < 1000) ? (
            <p className="job-money-lead">Each option needs to be at least $10.</p>
          ) : null}
        </>
      ) : (
        <>
          {options.length ? (
            <ul className="job-money-options" aria-label="Estimate options">
              {options.map((o) => {
                const isChosen = chosen?.key === o.key;
                return (
                  <li key={o.key} className={isChosen ? "is-chosen" : undefined}>
                    <div className="job-money-option-head">
                      <span className="job-money-option-name">{o.label}</span>
                      <span className="job-money-option-price">{formatCents(o.amountCents)}</span>
                    </div>
                    {o.description ? <p className="job-money-lead">{o.description}</p> : null}
                    {isChosen ? (
                      <p className="job-money-option-chosen">Customer&rsquo;s choice</p>
                    ) : !settled && !estimate.invoice?.payments.length ? (
                      <button
                        type="button"
                        className="btn btn-secondary text-sm"
                        disabled={busy}
                        onClick={() => void chooseOption(o.key)}
                      >
                        {chosen ? "Switch to this one" : "Customer chose this"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <dl className="job-money-meta">
            <div>
              <dt>Estimate</dt>
              <dd>
                {options.length && !chosen
                  ? `${options.length} options from ${formatCents(estimate.amountCents)}`
                  : formatCents(estimate.amountCents)}{" "}
                · {options.length && !chosen && estimate.status !== "draft" ? "waiting for the customer to pick" : statusWord(estimate.status)}
              </dd>
            </div>
            {estimate.invoice ? (
              <div>
                <dt>Invoice</dt>
                <dd>
                  {formatCents(estimate.invoice.amountCents)} ·{" "}
                  {statusWord(estimate.invoice.status)}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="job-money-actions">
            {estimate.status !== "accepted" && !settled ? (
              <button
                type="button"
                className="btn btn-void text-sm"
                disabled={busy}
                onClick={() => void sendEstimate()}
              >
                {busy
                  ? "Working…"
                  : estimate.publicToken
                    ? "Refresh send link"
                    : "Send to customer"}
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
                        () =>
                          setError("Could not copy — select the link manually"),
                      );
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            ) : null}

            {!estimate.invoice && options.length && !chosen ? null : !estimate.invoice ? (
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={busy}
                onClick={() => void createInvoice()}
              >
                {busy ? "Working…" : "Create invoice"}
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
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
