"use client";

import { useState } from "react";

export function EarlyAccessForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-6 text-center">
        <p className="text-lg font-medium text-green-300">You&apos;re on the list.</p>
        <p className="mt-2 text-sm text-muted">
          We&apos;ll reach out when your spot opens up.
        </p>
      </div>
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
      <button type="submit" className="btn btn-primary whitespace-nowrap">
        Join waitlist
      </button>
    </form>
  );
}
