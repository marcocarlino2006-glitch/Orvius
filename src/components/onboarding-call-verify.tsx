"use client";

import { telHref } from "@/lib/demo-line";
import Link from "next/link";
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

export function OnboardingCallVerify({ line, shopName }: OnboardingCallVerifyProps) {
  const router = useRouter();
  const [state, setState] = useState<VerifyState | null>(null);
  const [polling, setPolling] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/verify");
      if (!res.ok) return;
      const json = (await res.json()) as VerifyState;
      setState(json);
      if (json.verified) {
        setPolling(false);
      }
    } catch {
      /* keep polling */
    }
  }, []);

  useEffect(() => {
    check();
    if (!polling) return;
    const interval = setInterval(check, POLL_MS);
    return () => clearInterval(interval);
  }, [check, polling]);

  async function sendTestAlert() {
    setTesting(true);
    setTestError(null);
    setTestNote(null);
    try {
      const res = await fetch("/api/account/test-alert", { method: "POST" });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setTestNote(
        data.ok
          ? "Test alert sent — check your phone."
          : "Alert queued. Check SMS or email failover.",
      );
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
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
            {verified ? "You're live." : "One call. Prove it works."}
          </h1>
          <p className="onboarding-lead font-sans">
            {verified
              ? leadName
                ? `${shopName} received a lead from ${leadName}. Open Today and work the job.`
                : `${shopName} is receiving calls. Leads land in your inbox automatically.`
              : `Tap Call — Orvius answers as ${shopName}, qualifies, and texts you. We watch for the lead.`}
          </p>
        </div>
      </div>

      <p className="onboarding-verify-shop font-sans">{shopName}</p>

      <a href={telHref(line)} className="onboarding-hero-line font-sans">
        {line}
      </a>

      {!verified ? (
        <p className="onboarding-verify-waiting font-sans">
          Waiting for your test call…
        </p>
      ) : null}

      <div className="onboarding-actions onboarding-actions-split">
        <a href={telHref(line)} className="btn btn-void font-sans">
          {verified ? "Call again" : "Call your line"}
        </a>
        <button
          type="button"
          className="btn btn-ghost font-sans"
          disabled={testing}
          onClick={() => void sendTestAlert()}
        >
          {testing ? "Sending…" : "Send test alert"}
        </button>
      </div>

      {testNote ? (
        <p className="onboarding-hint font-sans" role="status">
          {testNote}
        </p>
      ) : null}
      {testError ? (
        <p className="onboarding-error font-sans" role="alert">
          {testError}
        </p>
      ) : null}

      <div className="onboarding-actions">
        <button
          type="button"
          className="btn btn-void font-sans"
          onClick={() => {
            router.replace("/dashboard");
            router.refresh();
          }}
          disabled={!verified}
        >
          Open your dashboard
        </button>
      </div>

      {!verified ? (
        <p className="onboarding-footnote font-sans">
          Can&apos;t call right now?{" "}
          <button
            type="button"
            className="onboarding-verify-link"
            onClick={() => {
              router.replace("/dashboard");
              router.refresh();
            }}
          >
            Open dashboard anyway
          </button>
          {" — "}
          we&apos;ll remind you to finish prove-it on Today.
        </p>
      ) : null}

      {verified && state?.firstLead ? (
        <p className="onboarding-footnote font-sans">
          <Link href={`/dashboard/inbox/${state.firstLead.id}`} className="onboarding-verify-link">
            View your first lead →
          </Link>
        </p>
      ) : null}
    </div>
  );
}
