"use client";

import { useCallback, useEffect, useState } from "react";

import { ShellLoading, ShellPanel } from "@/components/shell-primitives";
import {
  EXAMPLE_BILL_CENTS,
  PAYMENT_STEPS,
  SETUP_NEEDS,
  STRIPE_STANDARD_LABEL,
  exampleBillText,
  paymentExample,
  usd,
  type ConnectState,
} from "@/lib/payments-intro";

type ConnectResponse = {
  configured: boolean;
  feeRate: string;
  feeBps: number;
  shopName: string;
  status: {
    accountId: string | null;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    canAcceptPayments: boolean;
    state: ConnectState;
  };
};

const HEADLINE: Record<Exclude<ConnectState, "not_started" | "in_progress">, string> = {
  verifying: "Stripe is verifying your account",
  ready: "Card payments are live",
};

const BODY: Record<Exclude<ConnectState, "not_started" | "in_progress">, string> = {
  verifying:
    "Stripe has your details and is checking them. This usually takes minutes, and we will switch cards on the moment it clears — nothing more for you to do.",
  ready:
    "Customers pay deposits, estimates and bills by card from a text. Money settles to your bank on Stripe's payout schedule, usually two business days.",
};

type Financing = { enabled: boolean; active: string[]; pending: string[]; costNote: string };
const METHOD_LABEL: Record<string, string> = { affirm: "Affirm", klarna: "Klarna" };
const names = (list: string[]) => list.map((m) => METHOD_LABEL[m] ?? m).join(" and ");

function FinancingRow() {
  const [data, setData] = useState<Financing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/connect/financing", { cache: "no-store" })
      .then(async (res) => (res.ok ? setData(await res.json()) : null))
      .catch(() => null);
  }, []);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connect/financing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "That didn't save. Try again.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  return (
    <div className="financing-row mt-5 font-sans">
      <p className="payment-state-title">Pay over time</p>
      <p className="mt-1 text-sm leading-relaxed text-ash">
        {!data.enabled
          ? "Let customers split a big repair or a new system into payments with Affirm or Klarna, on the same pay links and estimates."
          : data.active.length
            ? `${names(data.active)} ${data.active.length === 1 ? "is" : "are"} live on your pay links for amounts they cover.${data.pending.length ? ` Stripe is still reviewing ${names(data.pending)}.` : ""}`
            : "Requested. Stripe is reviewing your account for Affirm and Klarna; they show up on your pay links the moment it clears."}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ash">{data.costNote}</p>
      {error ? <p className="os-own-color panel-action-error mt-2 text-sm">{error}</p> : null}
      <button type="button" className="btn btn-secondary mt-3" disabled={busy} onClick={() => void toggle(!data.enabled)}>
        {busy ? "Saving…" : data.enabled ? "Turn off pay over time" : "Turn on pay over time"}
      </button>
    </div>
  );
}

/**
 * The first time an owner meets card payments: what happens, what the customer
 * sees, what a real bill pays out, and what Stripe will ask for. Shown until
 * Stripe has the shop's details, so a half-finished setup gets the same answers.
 */
function GetPaidIntro({
  data,
  busy,
  resume,
  onStart,
}: {
  data: ConnectResponse;
  busy: boolean;
  resume: boolean;
  onStart: () => void;
}) {
  const ex = paymentExample(EXAMPLE_BILL_CENTS, data.feeBps);
  return (
    <div className="getpaid font-sans">
      <div className="getpaid-head">
        <p className="getpaid-title">{resume ? "Finish setting up payments" : "Get paid by text"}</p>
        <p className="getpaid-lead">
          {resume
            ? "Stripe still needs a few details. Your progress was saved, so you pick up where you stopped."
            : "When the work is done, Orvius texts your customer the bill and they pay from their phone. The money goes to your bank, not to Orvius."}
        </p>
      </div>

      <div className="getpaid-grid">
        <ol className="getpaid-steps">
          {PAYMENT_STEPS.map((step) => (
            <li key={step.when}>
              <span className="getpaid-when">{step.when}</span>
              <p className="getpaid-step-title">{step.title}</p>
              <p className="getpaid-step-body">{step.body}</p>
            </li>
          ))}
        </ol>

        <figure className="getpaid-preview" aria-label="Example of the text your customer gets">
          <figcaption>What your customer gets</figcaption>
          <div className="getpaid-phone" aria-hidden>
            <span className="getpaid-phone-from">{data.shopName}</span>
            <p className="getpaid-bubble">{exampleBillText(data.shopName, EXAMPLE_BILL_CENTS)}</p>
            <span className="getpaid-paybar">Pay {usd(EXAMPLE_BILL_CENTS)}</span>
          </div>
          <p className="getpaid-note">Example. Real bills use the job&apos;s amount.</p>
        </figure>
      </div>

      <div className="getpaid-facts">
        <section aria-labelledby="getpaid-cost">
          <p id="getpaid-cost" className="getpaid-facts-title">
            On a {usd(ex.billCents)} bill
          </p>
          <dl className="getpaid-math">
            <div>
              <dt>Stripe, at its standard {STRIPE_STANDARD_LABEL}</dt>
              <dd>−{usd(ex.stripeCents)}</dd>
            </div>
            <div>
              <dt>Orvius, {data.feeRate}</dt>
              <dd>−{usd(ex.orviusCents)}</dd>
            </div>
            <div className="getpaid-net">
              <dt>In your bank</dt>
              <dd>{usd(ex.netCents)}</dd>
            </div>
          </dl>
          <p className="getpaid-small">
            Stripe shows your exact rate during setup. Cash and checks you record yourself carry no fee. Your Orvius
            plan is billed separately and doesn&apos;t change.
          </p>
        </section>
        <section aria-labelledby="getpaid-needs">
          <p id="getpaid-needs" className="getpaid-facts-title">
            Have these ready, about 5 minutes
          </p>
          <ul className="getpaid-needs">
            {SETUP_NEEDS.map((need) => (
              <li key={need}>{need}</li>
            ))}
          </ul>
          <p className="getpaid-small">
            Setup happens on Stripe, which handles payments for millions of businesses. Orvius never sees your bank
            login and never holds your money.
          </p>
        </section>
      </div>

      <div className="getpaid-cta">
        <button type="button" className="btn btn-void" disabled={busy} onClick={onStart}>
          {busy ? "Opening Stripe…" : resume ? "Finish setup" : "Set up payments"}
        </button>
        <span className="getpaid-cta-note">You leave for Stripe and come straight back here.</span>
      </div>
    </div>
  );
}

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
      <ShellPanel title="Payments" dense>
        <ShellLoading />
      </ShellPanel>
    );
  }

  if (!data?.configured) {
    return (
      <ShellPanel title="Payments" dense>
        <div className="payment-locked-state font-sans">
          <span className="payment-state-step" aria-hidden>
            1
          </span>
          <div>
            <p className="payment-state-title">Payments setup pending</p>
            <p className="payment-state-copy">
              Card payments remain off until Orvius finishes the secure payout
              connection. Your phone service and workspace continue normally.
            </p>
          </div>
        </div>
      </ShellPanel>
    );
  }

  const { state } = data.status;

  if (state === "not_started" || state === "in_progress") {
    return (
      <ShellPanel title="Payments" dense>
        {error ? <p className="os-own-color panel-action-error mb-4 font-sans text-sm">{error}</p> : null}
        <GetPaidIntro data={data} busy={busy} resume={state === "in_progress"} onStart={() => void go("onboard")} />
      </ShellPanel>
    );
  }

  return (
    <ShellPanel title="Payments" dense>
      <p className="account-plan-name font-sans">{HEADLINE[state]}</p>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ash">
        {BODY[state]}
      </p>

      {error ? (
        <p className="os-own-color panel-action-error mt-4 font-sans text-sm">
          {error}
        </p>
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
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void load()}
          >
            Check again
          </button>
        )}
      </div>

      {state === "ready" ? <FinancingRow /> : null}

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
