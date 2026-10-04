"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import type { PasswordResetResponse } from "@/app/api/auth/password-reset/route";

export function PasswordResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "That reset link is incomplete.");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await res.json()) as PasswordResetResponse;
      if (!body.ok || !body.email) {
        setError(body.message);
        setWorking(false);
        return;
      }
      const result = await signIn("password", { email: body.email, password, redirect: false });
      window.location.href = result?.ok && !result.error ? "/dashboard" : "/signin";
    } catch {
      setError("Network error. Check your connection and try again.");
      setWorking(false);
    }
  }

  return (
    <div className="ov-signin-card">
      <p className="ov-signin-eyebrow">Shop workspace</p>
      <h1 className="ov-signin-title">Choose a new password.</h1>
      <form className="ov-signin-form" onSubmit={submit}>
        <label className="ov-signin-label" htmlFor="reset-password">
          New password
        </label>
        <input
          id="reset-password"
          className="ov-signin-input"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          minLength={8}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" className="ov-signin-submit" disabled={working || !token}>
          {working ? "Saving…" : "Save and sign in"}
        </button>
      </form>
      <div className="ov-signin-status" role="status" aria-live="polite">
        {error ? <p className="ov-signin-error">{error}</p> : null}
      </div>
      <p className="ov-signin-switch">
        <Link href="/signin">Back to sign in</Link>
      </p>
    </div>
  );
}
