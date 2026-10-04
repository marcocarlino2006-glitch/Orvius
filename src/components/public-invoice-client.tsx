"use client";

import { useCallback, useEffect, useState } from "react";

type PublicInvoice = {
  status: string;
  amountLabel: string | null;
  jobTitle: string | null;
  shopName: string;
  shopPhone: string | null;
  paid: boolean;
  cardPayAvailable: boolean;
  paidAt: string | null;
};

export function PublicInvoiceClient({ token }: { token: string }) {
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/invoice/${token}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invoice not found");
      setInvoice(data.invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invoice not found");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    The customer returning from Stripe usually beats the webhook, so the page
    confirms the session itself rather than showing an unpaid invoice to
    someone who just paid. Both paths are idempotent.
  */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (params.get("paid") === "1" && sessionId) {
      void (async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/public/invoice/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "confirm_card", sessionId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Could not confirm payment");
          setInvoice(data.invoice);
          window.history.replaceState({}, "", `/i/${token}`);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Could not confirm payment",
          );
        } finally {
          setBusy(false);
        }
      })();
      return;
    }

    if (params.get("canceled") === "1") {
      setNote("Checkout canceled. Nothing was charged — you can pay below.");
      window.history.replaceState({}, "", `/i/${token}`);
    }
  }, [token]);

  async function payByCard() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/public/invoice/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pay_card" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl as string;
        return;
      }
      if (data.alreadyPaid) {
        setInvoice(data.invoice);
        setNote("This invoice is already paid.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="public-money-muted font-sans">Loading…</p>;
  }

  if (!invoice) {
    return (
      <p className="public-money-error font-sans">
        {error ?? "This invoice link is invalid or expired."}
      </p>
    );
  }

  return (
    <div className="public-money font-sans">
      <p className="public-money-shop">{invoice.shopName}</p>
      <h1 className="public-money-title">
        {invoice.paid ? "Paid — thank you" : invoice.jobTitle ?? "Your invoice"}
      </h1>
      <p className="public-money-amount">{invoice.amountLabel}</p>
      <p className="public-money-notes">
        {invoice.paid
          ? `Paid to ${invoice.shopName}.`
          : `Balance due for your service, after any deposit you already paid. It goes directly to ${invoice.shopName}.`}
      </p>

      {error ? <p className="public-money-error">{error}</p> : null}
      {note ? <p className="public-money-ok">{note}</p> : null}

      <div className="public-money-actions">
        {invoice.paid ? (
          <p className="public-money-ok">
            Payment received. {invoice.shopName} has been notified.
          </p>
        ) : invoice.cardPayAvailable ? (
          <button
            type="button"
            className="btn btn-void"
            disabled={busy}
            onClick={() => void payByCard()}
          >
            {busy ? "Opening secure checkout…" : `Pay ${invoice.amountLabel}`}
          </button>
        ) : (
          <p className="public-money-muted">
            This shop is not set up to take cards yet.
            {invoice.shopPhone ? ` Call ${invoice.shopPhone} to pay another way.` : ""}
          </p>
        )}
      </div>

      <p className="public-money-fine">
        {invoice.paid
          ? "Keep this page for your records."
          : invoice.cardPayAvailable
            ? `Card details are handled by Stripe and never touch ${invoice.shopName} or Orvius. Funds go straight to the shop.`
            : "Pay the shop the way you agreed. Nothing is charged through this page."}
      </p>
    </div>
  );
}
