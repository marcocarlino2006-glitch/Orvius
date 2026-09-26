"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "@/components/toaster";
import { formatCentsExact } from "@/lib/money";

export type JobBill = {
  invoice: {
    id: string;
    amountCents: number;
    status: string;
    payUrl: string | null;
    sentAt: string | null;
    paidAt: string | null;
  } | null;
  finalAmountCents: number | null;
  cardPayReady: boolean;
};

export function JobBillSection({
  jobId,
  bill,
  defaultCents,
  depositPaidCents,
  customerPhone,
  onRefresh,
}: {
  jobId: string;
  bill: JobBill;
  defaultCents: number | null;
  depositPaidCents: number;
  customerPhone: string | null;
  onRefresh: () => void;
}) {
  const invoice = bill.invoice;
  const [total, setTotal] = useState(() => {
    const cents = bill.finalAmountCents ?? defaultCents;
    return cents ? String(cents / 100) : "";
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalCents = Math.round(Number(total.replace(/[^0-9.]/g, "")) * 100);
  const valid = Number.isFinite(totalCents) && totalCents >= 100;
  const balanceCents = valid ? Math.max(0, totalCents - depositPaidCents) : null;

  async function bill_(send: boolean) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalCents, send }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not bill this job");
      if (send && data.sms?.sent) setNote("Pay link texted to the customer.");
      else if (send) setNote("Link ready, but the text did not send. Copy it below.");
      else setNote("Pay link ready. Copy it below.");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not bill this job");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Pay link copied" });
    } catch {
      setError("Could not copy — select the link manually");
    }
  }

  if (invoice?.status === "paid") {
    return (
      <div className="job-money-share job-bill">
        <p className="job-money-share-label">Final bill</p>
        <p className="job-money-lead">
          {formatCentsExact(invoice.amountCents)} paid
          {invoice.paidAt ? ` on ${new Date(invoice.paidAt).toLocaleDateString()}` : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="job-money-share job-bill">
      <p className="job-money-share-label">Final bill</p>
      {error ? <p className="os-own-color job-money-error">{error}</p> : null}
      {!bill.cardPayReady ? (
        <p className="job-money-lead">
          Connect a payout account on{" "}
          <Link href="/dashboard/billing#payouts" className="underline underline-offset-2">
            Billing → payouts
          </Link>{" "}
          and customers can pay this bill by card from a text.
        </p>
      ) : null}
      <label className="job-bill-field">
        <span className="label">Job total ($)</span>
        <input
          className="input mt-1.5"
          inputMode="decimal"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="e.g. 640"
          disabled={busy}
        />
      </label>
      {balanceCents != null && depositPaidCents > 0 ? (
        <p className="job-money-lead">
          {formatCentsExact(depositPaidCents)} deposit already paid — the customer owes{" "}
          {formatCentsExact(balanceCents)}.
        </p>
      ) : null}
      {invoice?.payUrl ? <code className="job-money-share-url">{invoice.payUrl}</code> : null}
      <div className="job-money-actions">
        {bill.cardPayReady && customerPhone ? (
          <button
            type="button"
            className="btn btn-void text-sm"
            disabled={busy || !valid}
            onClick={() => void bill_(true)}
          >
            {busy
              ? "Sending…"
              : `${invoice?.sentAt ? "Resend" : "Text"} ${balanceCents != null ? formatCentsExact(balanceCents) : ""} pay link`}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={busy || !valid}
          onClick={() => void bill_(false)}
        >
          {invoice ? "Update bill" : "Create pay link"}
        </button>
        {invoice?.payUrl ? (
          <button type="button" className="btn btn-secondary text-sm" onClick={() => void copy(invoice.payUrl!)}>
            Copy link
          </button>
        ) : null}
      </div>
      {note ? <p className="job-money-lead">{note}</p> : null}
      {invoice?.sentAt && !note ? (
        <p className="job-money-lead">Texted {new Date(invoice.sentAt).toLocaleString()} — not paid yet.</p>
      ) : null}
    </div>
  );
}
