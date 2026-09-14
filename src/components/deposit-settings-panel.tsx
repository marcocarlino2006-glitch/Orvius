"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ShellLoading, ShellPanel } from "@/components/shell-primitives";
import { formatCentsExact } from "@/lib/money";

type DepositsResponse = {
  enabled: boolean;
  amountCents: number | null;
  netCents: number | null;
  feeRate: string;
  readiness:
    | { ready: true; amountCents: number }
    | { ready: false; reason: "connect_incomplete" | "deposits_off" };
  minCents: number;
  maxCents: number;
};

function dollarsFromCents(cents: number | null) {
  if (cents == null) return "";
  return String(Math.round(cents / 100));
}

export function DepositSettingsPanel() {
  const [data, setData] = useState<DepositsResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not load deposits");
      const deposits = body.deposits as DepositsResponse | null;
      if (!deposits) return;
      setData(deposits);
      setEnabled(deposits.enabled);
      /*
        The stored amount, not the resolved one. amountCents is null whenever
        deposits are off, and reading from it would blank the owner's saved
        figure every time they toggled off.
      */
      setAmount(
        dollarsFromCents(
          body.business?.depositAmountCents ?? deposits.amountCents,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load deposits");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const element = errorRef.current;
    if (!error || !element) return;

    const rules: Array<{
      href: string | null;
      selector: string;
      color: string;
      priority: string;
      matches: boolean;
    }> = [];
    const visit = (cssRules: CSSRuleList, href: string | null) => {
      for (const rule of cssRules) {
        if (rule instanceof CSSStyleRule) {
          const mentionsRelevantClass =
            rule.selectorText.includes("panel-action-error") ||
            rule.selectorText.includes("os-own-color");
          let matches = false;
          try {
            matches = element.matches(rule.selectorText);
          } catch {
            // Ignore selectors unsupported by Element.matches.
          }
          if (mentionsRelevantClass || (matches && rule.style.color)) {
            rules.push({
              href,
              selector: rule.selectorText,
              color: rule.style.getPropertyValue("color"),
              priority: rule.style.getPropertyPriority("color"),
              matches,
            });
          }
        }
        const nested = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules;
        if (nested) visit(nested, href);
      }
    };

    const stylesheets: Array<{ href: string | null; accessible: boolean }> = [];
    for (const sheet of document.styleSheets) {
      try {
        stylesheets.push({ href: sheet.href, accessible: true });
        visit(sheet.cssRules, sheet.href);
      } catch {
        stylesheets.push({ href: sheet.href, accessible: false });
      }
    }

    const computed = getComputedStyle(element);
    void fetch("/api/debug-css", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        className: element.className,
        computedColor: computed.color,
        inlineColor: element.style.color,
        parentColor: element.parentElement
          ? getComputedStyle(element.parentElement).color
          : null,
        stylesheets,
        rules,
      }),
    });
  }, [error]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const trimmed = amount.trim();
      const cents = trimmed
        ? Math.round(Number(trimmed.replace(/[^0-9.]/g, "")) * 100)
        : null;
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depositEnabled: enabled,
          depositAmountCents: cents,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save deposits");
      setData(body.deposits as DepositsResponse);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save deposits");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ShellPanel title="Booking deposits" dense>
        <ShellLoading />
      </ShellPanel>
    );
  }

  if (!data) {
    return (
      <ShellPanel title="Booking deposits" dense>
        <p className="font-sans text-sm leading-relaxed text-ash">
          Deposits appear once your shop is set up.
        </p>
      </ShellPanel>
    );
  }

  const needsConnect =
    !data.readiness.ready && data.readiness.reason === "connect_incomplete";

  /*
    The field only accepts whole dollars, so the bounds it enforces and the
    bounds it advertises are derived from one pair of numbers. Formatting the
    raw cents for the hint instead happened to read "$1" for a 50c floor only
    because the money formatter rounds.
  */
  const minDollars = Math.ceil(data.minCents / 100);
  const maxDollars = Math.floor(data.maxCents / 100);

  return (
    <ShellPanel title="Booking deposits" dense>
      <p className="account-plan-name font-sans">
        {data.readiness.ready
          ? `Asking ${formatCentsExact(data.readiness.amountCents)} at booking`
          : "Not asking for a deposit"}
      </p>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ash">
        A deposit is asked for when the job is booked — while the furnace is
        still out and the customer wants a commitment that someone is coming.
        It is the cheapest no-show insurance a shop can buy.
      </p>

      <label className="onboarding-field font-sans mt-5">
        <span className="pro-founder-cert-item">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setSaved(false);
            }}
            disabled={saving}
          />
          <span>Ask for a deposit when a job is booked</span>
        </span>
      </label>

      <label className="onboarding-field font-sans mt-4">
        <span className="onboarding-label">Deposit amount ($)</span>
        <input
          type="number"
          min={minDollars}
          max={maxDollars}
          step={1}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setSaved(false);
          }}
          className="onboarding-input"
          placeholder="49"
          disabled={saving}
        />
        <span className="onboarding-hint">
          Whole dollars, ${minDollars} to ${maxDollars}. Credited against the
          final bill by your shop — Orvius does not decide that.
        </span>
      </label>

      {error ? (
        <p
          ref={errorRef}
          className="os-own-color panel-action-error mt-4 font-sans text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="pro-settings-test-row">
        <button
          type="button"
          className="btn btn-void text-sm"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save deposits"}
        </button>
        {saved ? (
          <span className="pro-settings-test-meta font-sans">Saved</span>
        ) : null}
      </div>

      {/*
        Enabled and connected are two different gates, and an owner who has
        only cleared one of them needs to know which. The payout panel this
        sits under is where the other one is cleared.
      */}
      {needsConnect ? (
        <p className="mt-4 font-sans text-xs leading-relaxed text-ash">
          Your amount is saved, but deposits stay uncollected until the payout
          account above finishes connecting.
        </p>
      ) : data.netCents != null && data.amountCents != null ? (
        <p className="mt-4 font-sans text-xs leading-relaxed text-ash">
          You keep {formatCentsExact(data.netCents)} of every{" "}
          {formatCentsExact(data.amountCents)} deposit. Orvius keeps {data.feeRate};
          Stripe&rsquo;s processing fee is separate and charged by Stripe.
        </p>
      ) : null}
    </ShellPanel>
  );
}
