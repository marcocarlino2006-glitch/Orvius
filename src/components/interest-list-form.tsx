"use client";

import Link from "next/link";
import { useState } from "react";
import { FormField } from "@/components/shell-primitives";

export function InterestListForm({ trades }: { trades: readonly string[] }) {
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [trade, setTrade] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
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
          trade: trade || undefined,
          city: city || undefined,
          plan: "interest",
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "We couldn't save that. Try again, or email hello@orvius.im.");
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
      <p className="tier1-section-lead font-sans" role="status">
        You&apos;re on the interest list{trade ? ` for ${trade.toLowerCase()}` : ""}. We&apos;ll email you when it passes the same checks
        as the trades that are open now. Nothing is set up or charged until then.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        Website
        <input name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
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
        <FormField label="Business type">
          <select className="input" value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="">Select business type</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </FormField>
      </div>
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
        <FormField label="City">
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Austin, TX" />
        </FormField>
      </div>
      {error ? (
        <p className="font-sans text-sm text-flare-dim" role="alert">
          {error}
        </p>
      ) : null}
      <p className="font-sans text-sm text-ash-soft">
        We only use this to tell you when your trade opens. See the{" "}
        <Link href="/privacy" className="editorial-link">
          privacy policy
        </Link>
        .
      </p>
      <button type="submit" className="ov-btn ov-btn--solid" disabled={loading}>
        {loading ? "Saving…" : "Join the interest list"}
      </button>
    </form>
  );
}
