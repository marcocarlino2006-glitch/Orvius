"use client";

import Link from "next/link";
import { useState } from "react";
import { FormField } from "@/components/shell-primitives";
import { TRADES } from "@/lib/trades";

type FormProps = {
  variant?: "compact" | "full";
};

export function EarlyAccessForm({ variant = "compact" }: FormProps) {
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [trade, setTrade] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          businessName: businessName || undefined,
          phone: phone || undefined,
          trade: trade || undefined,
          city: city || undefined,
          plan: "pro",
          website,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "We couldn't save your request. Try again, or email hello@orvius.im.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("We couldn't reach Orvius. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div
        className="success-pop flex flex-col items-center gap-3 rounded-lg border border-ui-border bg-ui-surface p-6 text-center"
        role="status"
      >
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-live/15 text-live" aria-hidden>
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m5 10.5 3.2 3.2L15 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="font-sans text-lg font-medium text-ui-text">Audit request received.</p>
        <p className="font-sans text-sm text-ui-muted">
          We&apos;ll email you to schedule the call audit.
        </p>
      </div>
    );
  }

  if (variant === "full") {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <label
          aria-hidden="true"
          style={{ position: "absolute", left: "-9999px" }}
        >
          Website
          <input
            name="website"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Business name">
            <input
              className="input"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Your business name"
              autoComplete="organization"
            />
          </FormField>
          <FormField label="Your email" required>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              inputMode="email"
            />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Phone">
            <input
              className="input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              autoComplete="tel"
              inputMode="tel"
            />
          </FormField>
          <FormField label="Business type">
            <select
              className="input"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
            >
              <option value="">Select business type</option>
              {TRADES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="City / service area">
          <input
            className="input"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Austin, TX"
          />
        </FormField>
        {error ? (
          <p role="alert" className="font-sans text-sm text-flare-dim">{error}</p>
        ) : null}
        <label className="flex items-start gap-3 font-sans text-sm leading-relaxed text-ash-soft">
          <input
            type="checkbox"
            required
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-1 size-4 shrink-0 accent-[var(--flare)]"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="editorial-link">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="editorial-link">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <button
          type="submit"
          disabled={loading}
          className={`btn btn-void w-full sm:w-auto ${loading ? "btn-loading" : ""}`}
        >
          {loading ? "Submitting..." : "Request call audit"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email"
        required
        placeholder="you@yourbusiness.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="input flex-1"
      />
      <button
        disabled={loading}
        type="submit"
        className="btn btn-void whitespace-nowrap"
      >
        {loading ? "..." : "Request call audit"}
      </button>
      {error ? (
        <p role="alert" className="w-full font-sans text-sm text-flare-dim sm:order-3">
          {error}
        </p>
      ) : null}
    </form>
  );
}
