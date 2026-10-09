"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Offer = { eligible: true; endsAt: string; refundCents: number } | { eligible: false };

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MoneyBackDone({ cents }: { cents: number }) {
  return (
    <section className="money-back money-back--done font-sans" aria-live="polite">
      <p className="money-back-title">Refunded {dollars(cents)}</p>
      <p className="money-back-body">
        Stripe sends it back to your card, usually within 5 to 10 business days. Your plan is canceled and the Orvius
        line has stopped answering, so turn off call forwarding on your phone now.{" "}
        <Link href="/help/leaving-orvius">How to turn it off</Link>. Your records stay downloadable.
      </p>
    </section>
  );
}

export function MoneyBackPanel({ onRefunded }: { onRefunded: (cents: number) => void }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [step, setStep] = useState<"idle" | "confirm" | "working">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/billing/money-back")
      .then((res) => (res.ok ? res.json() : { eligible: false }))
      .then((data: Offer) => live && setOffer(data))
      .catch(() => live && setOffer({ eligible: false }));
    return () => {
      live = false;
    };
  }, []);

  async function claim() {
    setStep("working");
    setError(null);
    try {
      const res = await fetch("/api/billing/money-back", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { refundedCents?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "The refund didn't go through. Nothing was changed. Try again.");
      onRefunded(data.refundedCents ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The refund didn't go through. Try again.");
      setStep("confirm");
    }
  }

  if (!offer?.eligible) return null;
  const until = new Date(offer.endsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" });

  return (
    <section className="money-back font-sans" aria-label="First-month refund">
      <p className="money-back-title">Not working for your shop? Get your money back.</p>
      <p className="money-back-body">
        Until {until}, you can cancel and get the full {dollars(offer.refundCents)} back. One time per shop, no call needed.
      </p>
      {step === "idle" ? (
        <button type="button" className="sc-btn" onClick={() => setStep("confirm")}>
          Cancel and refund
        </button>
      ) : (
        <div className="money-back-confirm">
          <p className="money-back-body">
            This cancels your plan now and refunds {dollars(offer.refundCents)}. Your Orvius line stops answering today.
          </p>
          <div className="money-back-actions">
            <button type="button" className="sc-btn sc-btn--danger" disabled={step === "working"} onClick={() => void claim()}>
              {step === "working" ? "Refunding…" : `Yes, refund ${dollars(offer.refundCents)}`}
            </button>
            <button type="button" className="sc-btn" disabled={step === "working"} onClick={() => setStep("idle")}>
              Keep my plan
            </button>
          </div>
          {error ? <p className="money-back-error">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
