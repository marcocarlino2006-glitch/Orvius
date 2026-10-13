"use client";

import Link from "next/link";
import { useState } from "react";

/** A button rather than confirming on load, so a mail scanner opening the link can't move the account. */
export function EmailChangeConfirm({ token, fromEmail, toEmail }: { token: string; fromEmail: string; toEmail: string }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function confirm() {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "That didn't go through. Nothing changed.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  if (done) {
    return (
      <div className="ov-signin-verify">
        <h1>Your sign-in email is now {toEmail}.</h1>
        <p>Every device signed in as {fromEmail} was signed out. Sign in again with your new address.</p>
        <Link className="ov-signin-submit" href="/signin">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="ov-signin-verify">
      <h1>Move your sign-in to {toEmail}?</h1>
      <p>
        You&apos;ll sign in with {toEmail} from now on. {fromEmail} stops working and every device signed in with it is
        signed out. Your shop, calls and settings stay exactly as they are.
      </p>
      <button type="button" className="ov-signin-submit" disabled={working} onClick={() => void confirm()}>
        {working ? "Moving…" : "Yes, use this address"}
      </button>
      <div className="ov-signin-status" role="status" aria-live="polite">
        {error ? <p className="ov-signin-error">{error}</p> : null}
      </div>
    </div>
  );
}
