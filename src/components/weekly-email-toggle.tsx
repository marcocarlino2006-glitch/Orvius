"use client";

import Link from "next/link";
import { useState } from "react";

export function WeeklyEmailToggle({ token, shopName, initiallyOn }: { token: string; shopName: string; initiallyOn: boolean }) {
  const [on, setOn] = useState(initiallyOn);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(next: boolean) {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/unsubscribe?t=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't save. Try again.");
      setOn(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="ov-signin-verify">
      {on ? (
        <>
          <h1>Stop the Monday email for {shopName}?</h1>
          <p>
            You&apos;ll stop getting last week&apos;s calls and jobs by email. Call alerts, sign-in notices and billing
            emails still come, and the dashboard shows the same numbers any time.
          </p>
          <button type="button" className="ov-signin-submit" disabled={working} onClick={() => void set(false)}>
            {working ? "Saving…" : "Stop Monday emails"}
          </button>
        </>
      ) : (
        <>
          <h1>Monday emails are off for {shopName}.</h1>
          <p>Call alerts, sign-in notices and billing emails still come.</p>
          <button type="button" className="ov-signin-submit" disabled={working} onClick={() => void set(true)}>
            {working ? "Saving…" : "Turn them back on"}
          </button>
          <p>
            <Link href="/dashboard">Open your dashboard</Link>
          </p>
        </>
      )}
      <div className="ov-signin-status" role="status" aria-live="polite">
        {error ? <p className="ov-signin-error">{error}</p> : null}
      </div>
    </div>
  );
}
