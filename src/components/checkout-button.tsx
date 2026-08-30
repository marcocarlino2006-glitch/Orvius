"use client";

import Link from "next/link";
import { useState } from "react";

type CheckoutButtonProps = {
  label?: string;
  className?: string;
  variant?: "primary" | "secondary";
};

export function CheckoutButton({
  label = "Subscribe after pilot",
  className = "",
  variant = "secondary",
}: CheckoutButtonProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmail, setNeedsEmail] = useState(false);

  async function startCheckout(submittedEmail?: string) {
    const checkoutEmail = (submittedEmail ?? email).trim();
    if (!checkoutEmail) {
      setNeedsEmail(true);
      setError("Enter the email on your Orvius account.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: checkoutEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Checkout unavailable");
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("No checkout URL returned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      {needsEmail ? (
        <div className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            inputMode="email"
            className="input"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => startCheckout()}
            className={`btn w-full justify-center ${
              variant === "primary" ? "btn-void" : "btn-secondary"
            } ${loading ? "btn-loading" : ""}`}
          >
            {loading ? "Redirecting..." : label}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={() => startCheckout()}
          className={`btn w-full justify-center ${
            variant === "primary" ? "btn-void" : "btn-secondary"
          } ${loading ? "btn-loading" : ""}`}
        >
          {loading ? "Redirecting..." : label}
        </button>
      )}

      {error ? (
        <p className="mt-3 font-sans text-sm text-flare-dim">
          {error}{" "}
          <Link href="/pilot" className="underline underline-offset-2">
            Apply for pilot
          </Link>
        </p>
      ) : null}
    </div>
  );
}
