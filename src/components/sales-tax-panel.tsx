"use client";

import { useEffect, useState } from "react";

import { ShellLoading, ShellPanel } from "@/components/shell-primitives";
import { invalidateAccount } from "@/lib/account-client";
import { formatCentsExact } from "@/lib/money";
import { formatTaxRate, parseTaxRate, withSalesTax } from "@/lib/sales-tax";

/** One rate on every customer invoice. Bills already sent keep the rate they were priced at. */
export function SalesTaxPanel() {
  const [savedBps, setSavedBps] = useState<number | null>(null);
  const [rate, setRate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { business?: { salesTaxBps?: number } } | null) => {
        if (cancelled || !body?.business) return;
        const bps = body.business.salesTaxBps ?? 0;
        setSavedBps(bps);
        setRate(bps ? (bps / 100).toString() : "");
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const parsed = parseTaxRate(rate);

  async function save() {
    if (parsed == null) {
      setError("Type the rate as a number, like 8.25. Up to 15%.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      invalidateAccount();
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ salesTaxBps: parsed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "That did not save. Nothing changed.");
      setSavedBps(parsed);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Nothing changed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ShellPanel title="Sales tax" dense>
        <ShellLoading />
      </ShellPanel>
    );
  }
  if (savedBps == null) return null;

  const example = parsed ? withSalesTax(50_000, parsed) : null;

  return (
    <ShellPanel title="Sales tax" dense>
      <p className="account-plan-name font-sans">
        {savedBps ? `Adding ${formatTaxRate(savedBps)} to customer invoices` : "No sales tax on invoices"}
      </p>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ash">
        Estimates and job totals stay before tax. The invoice adds this rate and shows it as its own line, so the
        customer sees work, tax and total. Orvius&rsquo;s card fee is never charged on the tax.
      </p>

      <label className="onboarding-field font-sans mt-5">
        <span className="onboarding-label">Rate (%)</span>
        <input
          type="text"
          inputMode="decimal"
          value={rate}
          onChange={(e) => {
            setRate(e.target.value);
            setSaved(false);
            setError(null);
          }}
          className="onboarding-input"
          placeholder="0"
          aria-describedby="sales-tax-hint"
          disabled={saving}
        />
        <span id="sales-tax-hint" className="onboarding-hint">
          {example
            ? `A ${formatCentsExact(example.subtotalCents)} job bills ${formatCentsExact(example.totalCents)} (${formatCentsExact(example.taxCents)} tax).`
            : "Leave blank or 0 for no tax. Check your state's rate for the work you do; Orvius doesn't decide what's taxable."}
        </span>
      </label>

      {error ? <p className="os-own-color panel-action-error mt-4 font-sans text-sm">{error}</p> : null}

      <div className="pro-settings-test-row">
        <button type="button" className="btn btn-void text-sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save sales tax"}
        </button>
        {saved ? <span className="pro-settings-test-meta font-sans">Saved</span> : null}
      </div>
    </ShellPanel>
  );
}
