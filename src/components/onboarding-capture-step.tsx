"use client";

import {
  CARRIERS,
  type CaptureMode,
  type CarrierId,
} from "@/lib/carrier-forward";
import { useState } from "react";

type OnboardingCaptureStepProps = {
  line: string;
  shopName: string;
  onContinue: () => void;
};

export function OnboardingCaptureStep({
  line,
  shopName,
  onContinue,
}: OnboardingCaptureStepProps) {
  const [mode, setMode] = useState<CaptureMode | null>(null);
  const [carrier, setCarrier] = useState<CarrierId>("verizon");
  const [saving, setSaving] = useState(false);
  const [texting, setTexting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsNote, setSmsNote] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const guide = CARRIERS.find((c) => c.id === carrier) ?? CARRIERS[0]!;

  async function copyLine() {
    try {
      await navigator.clipboard.writeText(line);
      setSmsNote("Number copied.");
    } catch {
      setSmsNote(null);
    }
  }

  async function textSteps() {
    if (!mode) return;
    setTexting(true);
    setError(null);
    setSmsNote(null);
    try {
      const res = await fetch("/api/account/forward-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          carrier: mode === "forward" ? carrier : undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not text steps");
      setSmsNote(data.message ?? "Texted to your mobile.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not text steps");
    } finally {
      setTexting(false);
    }
  }

  async function confirmAndContinue() {
    if (!mode || !confirmed) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overflowForwardConfirmedAt: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="onboarding-capture">
      <h1 className="onboarding-title font-sans">Catch every missed call.</h1>
      <p className="onboarding-lead font-sans">
        {shopName}&apos;s Orvius line is ready. Pick how callers reach it — one
        choice, then we prove it works.
      </p>

      <p className="onboarding-verify-shop font-sans">Your Orvius number</p>
      <button
        type="button"
        className="onboarding-hero-line font-sans"
        onClick={() => void copyLine()}
      >
        {line}
      </button>
      <p className="onboarding-hint font-sans">Tap to copy</p>

      <div className="onboarding-capture-modes font-sans">
        <button
          type="button"
          className={`onboarding-capture-mode ${mode === "forward" ? "onboarding-capture-mode-active" : ""}`}
          onClick={() => setMode("forward")}
        >
          <strong>Forward my public number</strong>
          <span>Keep Google / trucks. Missed &amp; after-hours go to Orvius.</span>
        </button>
        <button
          type="button"
          className={`onboarding-capture-mode ${mode === "publish" ? "onboarding-capture-mode-active" : ""}`}
          onClick={() => setMode("publish")}
        >
          <strong>Make Orvius my main number</strong>
          <span>Put this number on Google, trucks, and ads.</span>
        </button>
      </div>

      {mode === "forward" ? (
        <div className="onboarding-form">
          <fieldset className="onboarding-field font-sans">
            <legend className="onboarding-label">Your carrier</legend>
            <div className="onboarding-trade-grid">
              {CARRIERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`onboarding-trade ${carrier === item.id ? "onboarding-trade-active" : ""}`}
                  onClick={() => setCarrier(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
          <ol className="onboarding-capture-steps font-sans">
            {guide.steps.map((step) => (
              <li key={step}>{step.replace("your Orvius number", line)}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {mode === "publish" ? (
        <ol className="onboarding-capture-steps font-sans">
          <li>Replace the shop number on Google Business with {line}.</li>
          <li>Update trucks, invoices, and ads when you can.</li>
          <li>Keep the old number forwarded to Orvius until the cutover is done.</li>
        </ol>
      ) : null}

      {mode ? (
        <div className="onboarding-actions onboarding-actions-split">
          <button
            type="button"
            className="btn btn-ghost font-sans"
            disabled={texting}
            onClick={() => void textSteps()}
          >
            {texting ? "Texting…" : "Text me the steps"}
          </button>
          <button
            type="button"
            className="btn btn-secondary font-sans"
            onClick={() => void copyLine()}
          >
            Copy number
          </button>
        </div>
      ) : null}

      {smsNote ? (
        <p className="onboarding-hint font-sans" role="status">
          {smsNote}
        </p>
      ) : null}

      {mode ? (
        <label className="onboarding-check font-sans mt-4">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            {mode === "publish"
              ? "Orvius is (or will be) my published shop number."
              : "I set missed / busy / after-hours forward to Orvius — or I will before go-live."}
          </span>
        </label>
      ) : null}

      {error ? (
        <p className="onboarding-error font-sans" role="alert">
          {error}
        </p>
      ) : null}

      <div className="onboarding-actions">
        <button
          type="button"
          className="btn btn-void font-sans"
          disabled={!mode || !confirmed || saving}
          onClick={() => void confirmAndContinue()}
        >
          {saving ? "Saving…" : "Prove it works"}
        </button>
      </div>
    </div>
  );
}
