"use client";

import { telHref } from "@/lib/demo-line";
import { markFirstNightPending } from "@/components/first-night-handoff";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type VerifyState = {
  verified: boolean;
  line: string | null;
  firstLead: { id: string; name: string | null; at: string } | null;
};

type OnboardingCallVerifyProps = {
  line: string;
  shopName: string;
};

const POLL_MS = 3_000;

/**
 * One job after the line exists: Call → Enter Command.
 * Capture (forward/publish) stays on Settings — never stamp overflow here.
 */
export function OnboardingCallVerify({ line, shopName }: OnboardingCallVerifyProps) {
  const router = useRouter();
  const [state, setState] = useState<VerifyState | null>(null);
  const [polling, setPolling] = useState(true);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/verify");
      if (!res.ok) {
        setVerifyError(
          res.status === 401
            ? "Your session expired. Sign in again, then return to setup."
            : "We couldn't check the line right now.",
        );
        setPolling(false);
        return;
      }
      const json = (await res.json()) as VerifyState;
      setState(json);
      setVerifyError(null);
      if (json.verified) {
        setPolling(false);
      }
    } catch {
      setVerifyError("Connection lost while checking the line.");
      setPolling(false);
    }
  }, []);

  useEffect(() => {
    check();
    if (!polling) return;
    const interval = setInterval(check, POLL_MS);
    return () => clearInterval(interval);
  }, [check, polling]);

  async function enterCommand() {
    if (!verified) return;
    setEntering(true);
    setError(null);
    try {
      // Line is proved. Do not invent overflow/forward confirm — Settings owns that.
      markFirstNightPending();
      router.replace("/dashboard?live=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setup");
    } finally {
      setEntering(false);
    }
  }

  const verified = state?.verified ?? false;
  const leadName = state?.firstLead?.name;

  return (
    <div className="onboarding-verify">
      <div className="onboarding-verify-status">
        {verified ? (
          <span className="onboarding-verify-badge onboarding-verify-badge-ok" aria-hidden>
            ✓
          </span>
        ) : (
          <span className="onboarding-verify-badge onboarding-verify-badge-wait" aria-hidden>
            <span className="onboarding-loading-dot" />
          </span>
        )}
        <div>
          <h1 className="onboarding-title font-sans">
            {verified ? "Line works. You’re in." : "Call your line once."}
          </h1>
          <p className="onboarding-lead font-sans">
            {verified
              ? leadName
                ? `${shopName} caught a lead from ${leadName}. Open Command and clear the board.`
                : `${shopName} is answering. Open Command — the banner at the top is always your next move.`
              : `Tap Call. Orvius answers as ${shopName} and texts you. Stay on this screen — we watch for the call.`}
          </p>
        </div>
      </div>

      <p className="onboarding-verify-shop font-sans">{shopName}</p>

      <a href={telHref(line)} className="onboarding-hero-line font-sans">
        {line}
      </a>

      {!verified ? (
        <p className="onboarding-verify-waiting font-sans">
          {verifyError ?? "Waiting for your call…"}
        </p>
      ) : null}

      {verifyError ? (
        <button
          type="button"
          className="onboarding-verify-link font-sans"
          onClick={() => {
            setVerifyError(null);
            setPolling(true);
            void check();
          }}
        >
          Try again
        </button>
      ) : null}

      {error ? (
        <p className="onboarding-error font-sans" role="alert">
          {error}
        </p>
      ) : null}

      <div className="onboarding-actions">
        {verified ? (
          <button
            type="button"
            className="btn btn-void font-sans"
            disabled={entering}
            onClick={() => void enterCommand()}
          >
            {entering ? "Opening…" : "Enter Command"}
          </button>
        ) : (
          <a href={telHref(line)} className="btn btn-void font-sans">
            Call your line
          </a>
        )}
      </div>

      {!verified ? (
        <p className="onboarding-footnote font-sans">
          Call from your cell. After it lands, one tap opens Command.
          Forward or publish details live in Settings if you need them later.
        </p>
      ) : null}
    </div>
  );
}
