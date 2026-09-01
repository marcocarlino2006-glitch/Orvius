"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { telHref } from "@/lib/demo-line";

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
            {verified ? "Line verified — you're live." : "Call your line to verify."}
          </h1>
          <p className="onboarding-lead font-sans">
            {verified
              ? leadName
                ? `${shopName} received a lead from ${leadName}. Your inbox is working end-to-end.`
                : `${shopName} is receiving calls. Leads will appear in your inbox automatically.`
              : `Dial ${line} from your phone. Orvius answers, qualifies the caller, and drops the lead in your inbox.`}
          </p>
        </div>
      </div>

      <a href={telHref(line)} className="onboarding-hero-line font-sans">
        {line}
      </a>

      {!verified ? (
        <p className="onboarding-verify-waiting font-sans">
          Waiting for your test call…
        </p>
      ) : null}

      <div className="onboarding-actions">
        <a href={telHref(line)} className="btn btn-void font-sans">
          {verified ? "Call again" : "Call your line"}
        </a>
        <button
          type="button"
          className="btn btn-ghost font-sans"
          onClick={() => {
            router.replace("/dashboard");
            router.refresh();
          }}
        >
          {verified ? "Open your dashboard" : "Skip for now"}
        </button>
      </div>

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
