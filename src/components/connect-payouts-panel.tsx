"use client";

import { useCallback, useEffect, useState } from "react";

import { ShellLoading, ShellPanel } from "@/components/shell-primitives";

type ConnectState = "not_started" | "in_progress" | "verifying" | "ready";

type ConnectResponse = {
  configured: boolean;
  feeRate: string;
  status: {
    accountId: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    canAcceptPayments: boolean;
    state: ConnectState;
  };
};

const HEADLINE: Record<ConnectState, string> = {
  not_started: "Take card payments",
  in_progress: "Finish connecting your account",
  verifying: "Stripe is verifying your account",
  ready: "Card payments are live",
};

const BODY: Record<ConnectState, string> = {
  not_started:
    "Connect a payout account and Orvius can collect deposits when a job is booked and payment when it is done. Money goes straight to your bank, not to us.",
  in_progress:
    "Stripe still needs a few details before your shop can accept cards. Your progress was saved.",
  verifying:
    "Stripe has your details and is checking them. This usually takes minutes, and we will switch cards on the moment it clears — nothing more for you to do.",
  ready:
    "Customers can pay your deposits and estimates by card. Funds settle to your bank on Stripe's normal payout schedule.",
};

export function ConnectPayoutsPanel() {
  const [data, setData] = useState<ConnectResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/connect", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load payout status");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payouts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function go(intent: "onboard" | "dashboard") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not open Stripe");
      if (body.url) {
        window.location.href = body.url as string;
        return;
      }
      throw new Error("Stripe did not return a link");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open Stripe");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <ShellPanel title="Payouts" dense>
        <ShellLoading />
      </ShellPanel>
    );
  }

  if (!data?.configured) {
    return (
      <ShellPanel title="Payouts" dense>
        <p className="font-sans text-sm leading-relaxed text-ash">
          Card payments are not configured on this deployment yet.
        </p>
      </ShellPanel>
    );
  }

  const { state } = data.status;

  return (
    <ShellPanel title="Payouts" dense>
      <p className="account-plan-name font-sans">{HEADLINE[state]}</p>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ash">
        {BODY[state]}
      </p>

      {error ? (
        <p className="mt-4 font-sans text-sm text-alarm">{error}</p>
      ) : null}

      <div className="mt-5">
        {state === "ready" ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void go("dashboard")}
          >
            {busy ? "Opening Stripe…" : "View payouts on Stripe"}
          </button>
        ) : state === "verifying" ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void load()}
          >
            Check again
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-void"
            disabled={busy}
            onClick={() => void go("onboard")}
          >
            {busy
              ? "Opening Stripe…"
              : state === "in_progress"
                ? "Finish setup"
                : "Connect payouts"}
          </button>
        )}
      </div>

      {/*
        The take rate is stated wherever a shop is asked to turn the rail on.
        An owner finding out about it from a payout statement is how trust dies.
      */}
      <p className="mt-4 font-sans text-xs leading-relaxed text-ash">
        Orvius keeps {data.feeRate} of each card payment we collect for you.
        Stripe&rsquo;s own processing fee is separate and charged by Stripe, the
        same as any card processor. Subscription billing is unaffected.
      </p>
    </ShellPanel>
  );
}
