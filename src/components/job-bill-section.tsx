"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "@/components/toaster";
import { formatCentsExact } from "@/lib/money";
import { formatTaxRate, withSalesTax } from "@/lib/sales-tax";
import { formatDay, formatWhen } from "@/lib/when";

export type JobBill = {
  invoice: {
    id: string;
    amountCents: number;
    status: string;
    payUrl: string | null;
    sentAt: string | null;
    paidAt: string | null;
    collectedCents?: number;
    claimedCents?: number;
    collectedHow?: string | null;
  } | null;
  finalAmountCents: number | null;
  cardPayReady: boolean;
  salesTaxBps?: number;
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
  const taxBps = bill.salesTaxBps ?? 0;
  const priced = valid ? withSalesTax(totalCents, taxBps) : null;
  const balanceCents = priced ? Math.max(0, priced.totalCents - depositPaidCents) : null;

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

  async function settle(action: "record" | "confirm" | "reject", method?: string) {
    if (!invoice) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, action, method }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't save. Try again.");
      if (action === "reject") setNote("Left open. The customer still owes this bill.");
      else toast({ title: data.paid ? "Bill marked paid" : "Payment recorded" });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
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
          {invoice.paidAt ? ` on ${formatDay(invoice.paidAt)}` : ""}
          {invoice.collectedHow ? ` · ${invoice.collectedHow}` : ""}.
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
          <Link href="/dashboard/billing#payouts" className="underline underline-offset-2">
            Connect payouts
          </Link>{" "}
          to let customers pay by card from a text.
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
      {priced && priced.taxCents > 0 ? (
        <p className="job-money-lead">
          Plus {formatTaxRate(taxBps)} sales tax ({formatCentsExact(priced.taxCents)}): {formatCentsExact(priced.totalCents)} total.
        </p>
      ) : null}
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
              : [invoice?.sentAt ? "Resend" : "Text", balanceCents != null ? formatCentsExact(balanceCents) : null, "pay link"]
                  .filter(Boolean)
                  .join(" ")}
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
      {invoice && (invoice.claimedCents ?? 0) > 0 ? (
        <div className="job-bill-claim" role="status">
          <p className="job-money-lead">
            The customer says they paid {formatCentsExact(invoice.claimedCents!)} outside card checkout. It isn&apos;t
            counted as collected until you confirm the money arrived.
          </p>
          <div className="job-money-actions">
            <button type="button" className="btn btn-void text-sm" disabled={busy} onClick={() => void settle("confirm")}>
              The money arrived
            </button>
            <button type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => void settle("reject")}>
              It hasn&apos;t arrived
            </button>
          </div>
        </div>
      ) : null}
      {invoice ? (
        <div className="job-bill-collect">
          <p className="job-money-lead">
            {(invoice.collectedCents ?? 0) > 0
              ? `${formatCentsExact(invoice.collectedCents!)} collected so far · ${formatCentsExact(Math.max(0, invoice.amountCents - invoice.collectedCents!))} still owed. Record the rest:`
              : "Got paid in person? Record how, so the bill closes:"}
          </p>
          <div className="job-money-actions job-bill-methods">
            {(["cash", "check", "bank", "other"] as const).map((m) => (
              <button key={m} type="button" className="btn btn-secondary text-sm" disabled={busy} onClick={() => void settle("record", m)}>
                {m === "bank" ? "Bank transfer" : m === "other" ? "Other" : m === "cash" ? "Cash" : "Check"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {note ? <p className="job-money-lead">{note}</p> : null}
      {invoice?.sentAt && !note ? (
        <p className="job-money-lead">Texted {formatWhen(invoice.sentAt)} — not paid yet.</p>
      ) : invoice && !note ? (
        <p className="job-money-lead">Not sent to the customer yet — the bill exists, but nobody has asked for the money.</p>
      ) : null}
    </div>
  );
}
