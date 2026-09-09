"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

/**
 * Exchanges a magic-link token for a session exactly once. The token is
 * single-use server-side, so a React strict-mode double effect would burn it
 * and then fail on the second attempt; the ref guards against that.
 */
export function SignInVerify({
  token,
  callbackUrl,
}: {
  token: string;
  callbackUrl: string;
}) {
  const [failed, setFailed] = useState(!token);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    signIn("email-link", { token, callbackUrl, redirect: false })
      .then((result) => {
        if (result?.error || !result?.ok) {
          setFailed(true);
          return;
        }
        window.location.href = callbackUrl;
      })
      .catch(() => setFailed(true));
  }, [token, callbackUrl]);

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
