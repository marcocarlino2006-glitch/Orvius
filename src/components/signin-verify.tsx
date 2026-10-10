"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

/**
 * Exchanges a magic-link token for a session exactly once. The token is
 * single-use server-side, so a React strict-mode double effect would burn it
 * and then fail on the second attempt; the ref guards against that. With
 * two-step on, the server asks for a code before it spends the link.
 */
export function SignInVerify({
  token,
  callbackUrl,
}: {
  token: string;
  callbackUrl: string;
}) {
  const [failed, setFailed] = useState(!token);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [working, setWorking] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const attempted = useRef(false);

  async function exchange(withCode?: string) {
    const result = await signIn("email-link", { token, callbackUrl, redirect: false, ...(withCode ? { code: withCode } : {}) });
    if (result?.code === "two_step_required") {
      setNeedsCode(true);
      return;
    }
    if (result?.code === "two_step_invalid") {
      setCodeError("That code didn't match. Use the 6 digits showing in your app now, or a recovery code.");
      return;
    }
    if (result?.error || !result?.ok) {
      setFailed(true);
      return;
    }
    window.location.href = callbackUrl;
  }

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    exchange().catch(() => setFailed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, callbackUrl]);

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (working || !code.trim()) return;
    setWorking(true);
    setCodeError(null);
    try {
      await exchange(code.trim());
    } catch {
      setCodeError("Network error. Check your connection and try again.");
    } finally {
      setWorking(false);
    }
  }

  if (needsCode && !failed) {
    return (
      <div className="ov-signin-verify">
        <h1>One more step.</h1>
        <p>Two-step sign-in is on for this account. Enter the code from your authenticator app.</p>
        <form className="ov-signin-form" onSubmit={submitCode}>
          <label className="ov-signin-label" htmlFor="verify-code">
            Code
          </label>
          <input
            id="verify-code"
            className="ov-signin-input"
            value={code}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="123456"
            autoFocus
            required
            onChange={(event) => {
              setCode(event.target.value);
              setCodeError(null);
            }}
          />
          <p className="ov-signin-hint">Lost your phone? Enter one of your recovery codes instead.</p>
          <button type="submit" className="ov-signin-submit" disabled={working}>
            {working ? "Checking…" : "Sign in"}
          </button>
        </form>
        <div className="ov-signin-status" role="status" aria-live="polite">
          {codeError ? <p className="ov-signin-error">{codeError}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="ov-signin-verify">
      {failed ? (
        <>
          <h1>That link is no longer valid.</h1>
          <p>
            Sign-in links work once and expire after 10 minutes. Request a fresh
            one and it will be waiting in your inbox.
          </p>
          <Link className="ov-signin-submit" href="/signin">
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <h1>Signing you in…</h1>
          <p>Verifying your link and opening your shop workspace.</p>
        </>
      )}
    </div>
  );
}
