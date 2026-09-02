"use client";

import { useState } from "react";

type BillingPortalButtonProps = {
  className?: string;
  label?: string;
};

export function BillingPortalButton({
  className = "",
  label = "Manage subscription",
}: BillingPortalButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Could not open billing portal");
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("No portal URL returned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Portal failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={loading}
        onClick={openPortal}
        className={`inst-btn inst-btn-ghost w-full justify-center ${loading ? "opacity-70" : ""}`}
      >
        {loading ? "Opening…" : label}
      </button>
      {error ? (
        <p className="mt-3 font-sans text-sm text-flare-dim">{error}</p>
      ) : null}
    </div>
  );
}
