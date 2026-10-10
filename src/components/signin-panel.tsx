"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import type { PasswordResetResponse } from "@/app/api/auth/password-reset/route";
import type { SignUpResponse } from "@/app/api/auth/signup/route";

export type SignInMode = "signup" | "signin" | "forgot";

type Status =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "sent"; message: string }
  | { kind: "error"; message: string };

const COPY: Record<SignInMode, { title: string; submit: string; working: string }> = {
  signup: { title: "Create your Orvius account.", submit: "Create account", working: "Creating…" },
  signin: { title: "Sign in to Orvius.", submit: "Sign in", working: "Signing in…" },
  forgot: { title: "Reset your password.", submit: "Email me a reset link", working: "Sending…" },
};

/**
 * The auth card: Google, or email and password. Signing up puts the owner
 * straight into the workspace; email is only used to reset a forgotten password.
 */
export function SignInPanel({
  callbackUrl,
  selfServeEnabled = false,
  initialMode = "signin",
}: {
  callbackUrl: string;
  selfServeEnabled?: boolean;
  initialMode?: SignInMode;
}) {
  const [mode, setMode] = useState<SignInMode>(
    initialMode === "signup" && !selfServeEnabled ? "signin" : initialMode,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const copy = COPY[mode];

  function switchTo(next: SignInMode) {
    setMode(next);
    setNeedsCode(false);
    setCode("");
    setStatus({ kind: "idle" });
  }

  async function signInWithPassword() {
    const result = await signIn("password", { email, password, ...(needsCode ? { code } : {}), redirect: false });
    if (result?.code === "two_step_required") {
      setNeedsCode(true);
      setStatus({ kind: "idle" });
      return;
    }
    if (result?.code === "two_step_invalid") {
      setStatus({ kind: "error", message: "That code didn't match. Use the 6 digits showing in your app now, or a recovery code." });
      return;
    }
    if (result?.error || !result?.ok) {
      setStatus({ kind: "error", message: "Wrong email or password." });
      return;
    }
    window.location.href = callbackUrl;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (status.kind === "working") return;
    setStatus({ kind: "working" });
    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const body = (await res.json()) as SignUpResponse;
        if (!body.ok) {
          setStatus({ kind: "error", message: body.message ?? "Couldn't create the account." });
          return;
        }
        await signInWithPassword();
      } else if (mode === "signin") {
        await signInWithPassword();
      } else {
        const res = await fetch("/api/auth/password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const body = (await res.json()) as PasswordResetResponse;
        setStatus(body.ok ? { kind: "sent", message: body.message } : { kind: "error", message: body.message });
      }
    } catch {
      setStatus({ kind: "error", message: "Network error. Check your connection and try again." });
    }
  }

  return (
    <div className="ov-signin-card">
      <p className="ov-signin-eyebrow">Shop workspace</p>
      <h1 className="ov-signin-title">{copy.title}</h1>
      {!selfServeEnabled && mode !== "forgot" ? (
        <p className="ov-signin-sub">
          Use the account connected to your shop. <a href="/pilot">Book a call audit</a>.
        </p>
      ) : null}

      {mode !== "forgot" ? (
        <>
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
        </>
      ) : null}

      <form className="ov-signin-form" onSubmit={submit}>
        <label className="ov-signin-label" htmlFor="signin-email">
          Work email
        </label>
        <input
          id="signin-email"
          className="ov-signin-input"
          type="email"
          name="email"
          value={email}
          autoComplete={mode === "signup" ? "email" : "username"}
          placeholder="you@yourshop.com"
          required
          onChange={(event) => {
            setEmail(event.target.value);
            if (status.kind !== "idle") setStatus({ kind: "idle" });
          }}
        />
        {mode !== "forgot" ? (
          <>
            <label className="ov-signin-label ov-signin-label--gap" htmlFor="signin-password">
              Password
            </label>
            <input
              id="signin-password"
              className="ov-signin-input"
              type="password"
              name="password"
              value={password}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "At least 8 characters" : ""}
              minLength={mode === "signup" ? 8 : undefined}
              required
              onChange={(event) => {
                setPassword(event.target.value);
                if (status.kind !== "idle") setStatus({ kind: "idle" });
              }}
            />
          </>
        ) : null}
        {needsCode && mode === "signin" ? (
          <>
            <label className="ov-signin-label ov-signin-label--gap" htmlFor="signin-code">
              Code from your authenticator app
            </label>
            <input
              id="signin-code"
              className="ov-signin-input"
              name="code"
              value={code}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="123456"
              required
              autoFocus
              aria-describedby="signin-code-hint"
              onChange={(event) => {
                setCode(event.target.value);
                if (status.kind !== "idle") setStatus({ kind: "idle" });
              }}
            />
            <p id="signin-code-hint" className="ov-signin-hint">
              Two-step sign-in is on for this account. Lost your phone? Enter one of your recovery codes instead.
            </p>
          </>
        ) : null}
        <button type="submit" className="ov-signin-submit" disabled={status.kind === "working"}>
          {status.kind === "working" ? copy.working : copy.submit}
        </button>
      </form>

      <div className="ov-signin-status" role="status" aria-live="polite">
        {status.kind === "sent" ? <p className="ov-signin-sent">{status.message}</p> : null}
        {status.kind === "error" ? <p className="ov-signin-error">{status.message}</p> : null}
      </div>

      <p className="ov-signin-switch">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button type="button" onClick={() => switchTo("signin")}>Sign in</button>
          </>
        ) : mode === "signin" ? (
          <>
            <button type="button" onClick={() => switchTo("forgot")}>Forgot password?</button>
            {selfServeEnabled ? (
              <>
                {" · "}
                New shop?{" "}
                <button type="button" onClick={() => switchTo("signup")}>Create an account</button>
              </>
            ) : null}
          </>
        ) : (
          <button type="button" onClick={() => switchTo("signin")}>Back to sign in</button>
        )}
      </p>

      <p className="ov-signin-legal">
        By continuing you agree to the <a href="/terms">Terms</a> and{" "}
        <a href="/privacy">Privacy Policy</a>.
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
