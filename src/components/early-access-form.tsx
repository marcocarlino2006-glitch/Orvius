"use client";

import { useState } from "react";
import { FormField } from "@/components/shell-primitives";

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
          plan: "pilot",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Signup failed");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="success-pop rounded-md border border-live/30 bg-live/10 p-6 text-center">
        <p className="font-sans text-lg font-medium text-live">
          You&apos;re on the list.
        </p>
        <p className="mt-2 font-sans text-sm text-ash-soft">
          We&apos;ll reach out within 24 hours to get you set up.
        </p>
      </div>
    );
  }

  if (variant === "full") {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Business name">
            <input
              className="input"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Summit HVAC"
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
            />
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Phone">
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
            />
          </FormField>
          <FormField label="Trade">
            <select
              className="input"
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
            >
              <option value="">Select trade</option>
              <option value="hvac">HVAC</option>
              <option value="plumbing">Plumbing</option>
              <option value="electrical">Electrical</option>
              <option value="roofing">Roofing</option>
              <option value="other">Other home services</option>
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
          <p className="font-sans text-sm text-flare-dim">{error}</p>
        ) : null}
        <button
          disabled={loading}
          className={`btn btn-on-void w-full sm:w-auto ${loading ? "btn-loading" : ""}`}
        >
          {loading ? "Submitting..." : "Apply for free pilot"}
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
        className="btn btn-primary whitespace-nowrap"
      >
        {loading ? "..." : "Join waitlist"}
      </button>
      {error ? (
        <p className="w-full font-sans text-sm text-flare-dim sm:order-3">
          {error}
        </p>
      ) : null}
    </form>
  );
}
