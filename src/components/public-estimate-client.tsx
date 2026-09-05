"use client";

import { useCallback, useEffect, useState } from "react";

type PublicEstimate = {
  token: string;
  status: string;
  amountCents: number;
  amountLabel: string | null;
  notes: string | null;
  shopName: string;
  jobTitle: string;
  jobAddress: string | null;
  invoice: { id: string; status: string; paid: boolean } | null;
  cardPayAvailable?: boolean;
};

export function PublicEstimateClient({ token }: { token: string }) {
  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/estimate/${token}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Estimate not found");
      setEstimate(data.estimate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Estimate not found");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const paid = params.get("paid");
    if (paid === "1" && sessionId) {
      void (async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/public/estimate/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "confirm_card", sessionId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Could not confirm payment");
          setEstimate(data.estimate);
          setNote("Card payment received. Thank you.");
          window.history.replaceState({}, "", `/e/${token}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not confirm payment");
        } finally {
          setBusy(false);
        }
      })();
    } else if (params.get("canceled") === "1") {
      setNote("Card checkout canceled — you can try again anytime.");
      window.history.replaceState({}, "", `/e/${token}`);
    }
  }, [token]);

  async function run(action: "accept" | "pay_manual" | "pay_card") {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/public/estimate/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      if (action === "pay_card" && data.checkoutUrl) {
        window.location.href = data.checkoutUrl as string;
        return;
      }
      setEstimate(data.estimate);
      setNote(
        action === "accept"
          ? "Estimate accepted. Thank you."
          : "Payment recorded. The shop has been notified.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="public-money-muted font-sans">Loading estimate…</p>;
  }

  if (!estimate) {
    return (
      <p className="public-money-error font-sans">
        {error ?? "This estimate link is invalid or expired."}
      </p>
    );
  }

  const paid = estimate.invoice?.paid || estimate.invoice?.status === "paid";
  const accepted = estimate.status === "accepted" || Boolean(estimate.invoice);
  const cardReady = Boolean(estimate.cardPayAvailable);

  return (
    <div className="public-money font-sans">
      <p className="public-money-shop">{estimate.shopName}</p>
      <h1 className="public-money-title">{estimate.jobTitle}</h1>
      {estimate.jobAddress ? (
        <p className="public-money-meta">{estimate.jobAddress}</p>
      ) : null}
      <p className="public-money-amount">{estimate.amountLabel}</p>
      {estimate.notes ? <p className="public-money-notes">{estimate.notes}</p> : null}
      <p className="public-money-status">Status · {estimate.status}</p>

      {error ? <p className="public-money-error">{error}</p> : null}
      {note ? <p className="public-money-ok">{note}</p> : null}

      <div className="public-money-actions">
        {!accepted ? (
          <button
            type="button"
            className="btn btn-void"
            disabled={busy}
            onClick={() => void run("accept")}
          >
            {busy ? "Working…" : "Accept estimate"}
          </button>
        ) : null}

        {accepted && !paid ? (
          <>
            {cardReady ? (
              <button
                type="button"
                className="btn btn-void"
                disabled={busy}
                onClick={() => void run("pay_card")}
              >
                {busy ? "Opening checkout…" : "Pay by card"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void run("pay_manual")}
            >
              {busy ? "Working…" : "I paid (cash / check / Venmo)"}
            </button>
          </>
        ) : null}

        {paid ? <p className="public-money-ok">Paid in full. You’re all set.</p> : null}
      </div>

      <p className="public-money-fine">
        {cardReady
          ? "Card payments run on Orvius checkout today. Direct shop payouts via Stripe Connect ship next."
          : "Card checkout is not configured yet. Accept here and settle with the shop — or the shop can record payment from the job."}
      </p>
    </div>
  );
}
