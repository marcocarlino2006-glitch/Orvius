"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import type { MagicLinkResponse } from "@/app/api/auth/magic-link/route";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; message: string; devLink?: string }
  | { kind: "error"; message: string };

/**
 * The auth card. Two ways in, both real: Google OAuth, and a single-use email
 * link issued by /api/auth/magic-link. There is no third button for an SSO
 * vendor we have not integrated — a control that cannot complete a sign-in is
 * worse than an absent one.
 */
export function SignInPanel({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function requestLink(event: React.FormEvent) {
    event.preventDefault();
    if (status.kind === "sending") return;
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json()) as MagicLinkResponse;
      setStatus(
        body.sent
          ? { kind: "sent", message: body.message, devLink: body.devLink }
          : { kind: "error", message: body.message },
      );
    } catch {
      setStatus({
        kind: "error",
        message: "Network error. Check your connection and try again.",
      });
    }
  }

  return (
    <div className="ov-signin-card">
      <p className="ov-signin-eyebrow">Shop workspace</p>
      <h1 className="ov-signin-title">Sign in to Orvius.</h1>
      <p className="ov-signin-sub">
        Use the account connected to your shop. New here?{" "}
        <a href="/pilot">Book a call audit</a>.
      </p>

      <button
        type="button"
        className="ov-signin-sso"
        onClick={() => signIn("google", { callbackUrl })}
      >
        <GoogleMark />
        Continue with Google
      </button>

      <div className="ov-signin-or">
        <span>or</span>
      </div>

      <form className="ov-signin-form" onSubmit={requestLink}>
        <label className="ov-signin-label" htmlFor="signin-email">
          Work email
        </label>
        <input
          id="signin-email"
          className="ov-signin-input"
          type="email"
          name="email"
          value={email}
          autoComplete="email"
          placeholder="you@yourshop.com"
          required
          onChange={(event) => {
            setEmail(event.target.value);
            if (status.kind !== "idle") setStatus({ kind: "idle" });
          }}
        />
        <button
          type="submit"
          className="ov-signin-submit"
          disabled={status.kind === "sending" || email.trim().length === 0}
        >
          {status.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>

      <div className="ov-signin-status" role="status" aria-live="polite">
        {status.kind === "sent" ? (
          <p className="ov-signin-sent">
            {status.message}
            {status.devLink ? (
              <>
                {" "}
                <a href={status.devLink}>Open the link (local build only)</a>
              </>
            ) : null}
          </p>
        ) : null}
        {status.kind === "error" ? (
          <p className="ov-signin-error">{status.message}</p>
        ) : null}
      </div>

      <p className="ov-signin-legal">
        Single-use link, expires in 10 minutes. By signing in you agree to the{" "}
        <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.56 2.96-2.26 5.48-4.82 7.18l7.73 6.01c4.51-4.16 7.11-10.28 7.11-17.62z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6.01c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
