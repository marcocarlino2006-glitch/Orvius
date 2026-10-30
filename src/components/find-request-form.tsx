"use client";

import { useState } from "react";
import { FormField } from "@/components/shell-primitives";

export function FindRequestForm({ trade, zip }: { trade: string; zip: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [need, setNeed] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade, zip, name, phone, need, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That didn't save. Call a shop if one is listed.");
        return;
      }
      setDone(true);
    } catch {
      setError("We couldn't reach Orvius. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <p className="tier1-section-lead font-sans" role="status">
        A shop in this area can take this from their desk. If one is listed above, you can also call them now.
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
        <FormField label="Your name" required>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </FormField>
        <FormField label="Mobile number" required>
          <input className="input" required value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" />
        </FormField>
      </div>
      <FormField label="What do you need done?" required>
        <textarea className="input" required minLength={8} maxLength={400} value={need} onChange={(e) => setNeed(e.target.value)} rows={3} />
      </FormField>
      {error ? (
        <p className="font-sans" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="ov-btn ov-btn--solid" disabled={loading}>
        {loading ? "Sending…" : "Ask for a shop"}
      </button>
    </form>
  );
}
