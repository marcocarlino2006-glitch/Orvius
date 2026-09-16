"use client";

import { useCallback, useEffect, useState } from "react";

type PublicDeposit = {
  token: string | null;
  status: string;
  amountCents: number;
  amountLabel: string | null;
  shopName: string;
  shopPhone: string | null;
  paid: boolean;
  cardPayAvailable: boolean;
  paidAt: string | null;
};

export function PublicDepositClient({ token }: { token: string }) {
  const [deposit, setDeposit] = useState<PublicDeposit | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/deposit/${token}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Deposit not found");
      setDeposit(data.deposit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit not found");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    The customer returning from Stripe usually beats the webhook, so the page
    confirms the session itself rather than showing an unpaid deposit to
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
          const res = await fetch(`/api/public/deposit/${token}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "confirm_card", sessionId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Could not confirm payment");
          setDeposit(data.deposit);
          window.history.replaceState({}, "", `/d/${token}`);
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
      setNote("Checkout canceled — your slot is still open, you can pay below.");
      window.history.replaceState({}, "", `/d/${token}`);
    }
  }, [token]);

  async function payByCard() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/public/deposit/${token}`, {
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
        setDeposit(data.deposit);
        setNote("This deposit is already paid.");
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

  if (!deposit) {
    return (
      <p className="public-money-error font-sans">
        {error ?? "This deposit link is invalid or expired."}
      </p>
    );
  }

  return (
    <div className="public-money font-sans">
      <p className="public-money-shop">{deposit.shopName}</p>
      <h1 className="public-money-title">
        {deposit.paid ? "Appointment held" : "Hold your appointment"}
      </h1>
      <p className="public-money-amount">{deposit.amountLabel}</p>
      <p className="public-money-notes">
        This deposit holds your slot and comes off your final bill. It is paid
        directly to {deposit.shopName}.
      </p>

      {error ? <p className="public-money-error">{error}</p> : null}
      {note ? <p className="public-money-ok">{note}</p> : null}

      <div className="public-money-actions">
        {deposit.paid ? (
          <p className="public-money-ok">
            Deposit paid. {deposit.shopName} has your appointment held.
          </p>
        ) : deposit.cardPayAvailable ? (
          <button
            type="button"
            className="btn btn-void"
            disabled={busy}
            onClick={() => void payByCard()}
          >
            {busy ? "Opening secure checkout…" : `Pay ${deposit.amountLabel}`}
          </button>
        ) : (
          <p className="public-money-muted">
            This shop is not set up to take cards yet.
            {deposit.shopPhone ? ` Call ${deposit.shopPhone} to confirm.` : ""}
          </p>
        )}
      </div>

      <p className="public-money-fine">
        {deposit.paid
          ? "Keep this page for your records."
          : deposit.cardPayAvailable
            ? `Card details are handled by Stripe and never touch ${deposit.shopName} or Orvius. Funds go straight to the shop.`
            : "Nothing is owed through this page. Your appointment stands on what you agreed with the shop."}
      </p>
    </div>
  );
}
