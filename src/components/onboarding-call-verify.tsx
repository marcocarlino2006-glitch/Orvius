"use client";

import { ActivationChecklist } from "@/components/activation-checklist";
import { displayLine, telHref } from "@/lib/demo-line";
import { markFirstNightPending } from "@/components/first-night-handoff";
import { useRouter } from "next/navigation";
import { useState } from "react";

type OnboardingCallVerifyProps = {
  line: string;
  shopName: string;
};

/**
 * The line exists, so the receptionist is on. Opening the desk is the only step.
 */
export function OnboardingCallVerify({ line, shopName }: OnboardingCallVerifyProps) {
  const router = useRouter();
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enterCommand() {
    setEntering(true);
    setError(null);
    try {
      markFirstNightPending();
      router.replace("/dashboard?live=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finish setup");
      setEntering(false);
    }
  }

  return (
    <div className="onboarding-verify">
      <div className="onboarding-verify-status">
        <span className="onboarding-verify-badge onboarding-verify-badge-ok" aria-hidden>
          ✓
        </span>
        <div>
          <h1 className="onboarding-title font-sans">Your receptionist is on.</h1>
          <p className="onboarding-lead font-sans">
            {shopName} answers this number. Callers who have it reach the shop.
          </p>
        </div>
      </div>

      <a href={telHref(line)} className="onboarding-hero-line font-sans">
        {displayLine(line)}
      </a>

      <ActivationChecklist />

      {error ? (
        <p className="onboarding-error font-sans" role="alert">
          {error}
        </p>
      ) : null}

      <div className="onboarding-actions">
        <button type="button" className="btn btn-void font-sans" disabled={entering} onClick={() => void enterCommand()}>
          {entering ? "Opening…" : "Open the desk"}
        </button>
      </div>
    </div>
  );
}
