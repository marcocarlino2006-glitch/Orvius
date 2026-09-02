"use client";

import { OnboardingCallVerify } from "@/components/onboarding-call-verify";
import { OrviusLogo } from "@/components/orvius-logo";
import { company, pricing } from "@/lib/company";
import { TRADES, type Trade } from "@/lib/trades";
import { useRouter } from "next/navigation";
import { useState } from "react";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "shop", label: "Shop" },
  { id: "alerts", label: "Alerts" },
  { id: "live", label: "Go live" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<StepId>("welcome");
  const [name, setName] = useState("");
  const [trade, setTrade] = useState<Trade>("HVAC");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [greeting, setGreeting] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisionedLine, setProvisionedLine] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const defaultGreeting = name.trim()
    ? `Thank you for calling ${name.trim()}. How can I help you today?`
    : "";

  function next() {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1].id);
    }
  }

  function back() {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx > 0) {
      setStep(STEPS[idx - 1].id);
    }
  }

  async function finish() {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          trade,
          ownerPhone: ownerPhone.trim(),
          greeting: greeting.trim() || undefined,
        }),
      });

      const json = (await res.json()) as { error?: string; line?: string | null };
      if (!res.ok) {
        setError(json.error ?? "Setup failed. Try again.");
        return;
      }

      if (json.line) {
        setProvisionedLine(json.line);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <div className="onboarding-glow" aria-hidden />

      <div className="onboarding-frame">
        <header className="onboarding-header">
          <OrviusLogo size="md" variant="void" />
          <p className="onboarding-eyebrow font-sans">{company.productName} setup</p>
        </header>

        <nav className="onboarding-steps font-sans" aria-label="Setup progress">
          {STEPS.map((item, index) => {
            const active = item.id === step;
            const done = index < stepIndex;
            return (
              <div
                key={item.id}
                className={`onboarding-step ${active ? "onboarding-step-active" : ""} ${done ? "onboarding-step-done" : ""}`}
              >
                <span className="onboarding-step-num">{index + 1}</span>
                <span className="onboarding-step-label">{item.label}</span>
              </div>
            );
          })}
        </nav>

        <div className="onboarding-panel">
          {step === "welcome" ? (
            <>
              <h1 className="onboarding-title font-sans">
                Welcome to your Orvius workspace.
              </h1>
              <p className="onboarding-lead font-sans">
                In a few steps you&apos;ll connect your shop, set owner alerts, and
                open your dashboard — inbox, customers, jobs, and dispatch in one
                place.
              </p>
              <ul className="onboarding-rings font-sans">
                <li>
                  <span className="onboarding-ring-num">01</span>
                  <span>
                    <strong>Answer every call</strong> · AI receptionist on your line
                  </span>
                </li>
                <li>
                  <span className="onboarding-ring-num">02</span>
                  <span>
                    <strong>Alert you instantly</strong> · SMS and email when a lead lands
                  </span>
                </li>
                <li>
                  <span className="onboarding-ring-num">03</span>
                  <span>
                    <strong>Work from one inbox</strong> · Callback, text, and book from one screen
                  </span>
                </li>
              </ul>
              <div className="onboarding-actions">
                <button
                  type="button"
                  className="btn btn-void onboarding-btn-primary font-sans"
                  onClick={next}
                >
                  Get started
                </button>
              </div>
            </>
          ) : null}

          {step === "shop" ? (
            <>
              <h1 className="onboarding-title font-sans">Tell us about your shop.</h1>
              <p className="onboarding-lead font-sans">
                This is how Orvius greets callers and labels your workspace.
              </p>
              <div className="onboarding-form">
                <label className="onboarding-field font-sans">
                  <span className="onboarding-label">Shop name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Summit HVAC & Cooling"
                    className="onboarding-input"
                    autoFocus
                  />
                </label>
                <fieldset className="onboarding-field font-sans">
                  <legend className="onboarding-label">Primary trade</legend>
                  <div className="onboarding-trade-grid">
                    {TRADES.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`onboarding-trade ${trade === item ? "onboarding-trade-active" : ""}`}
                        onClick={() => setTrade(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="onboarding-actions onboarding-actions-split">
                <button
                  type="button"
                  className="btn btn-ghost font-sans"
                  onClick={back}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-void font-sans"
                  disabled={name.trim().length < 2}
                  onClick={next}
                >
                  Continue
                </button>
              </div>
            </>
          ) : null}

          {step === "alerts" ? (
            <>
              <h1 className="onboarding-title font-sans">Owner alerts.</h1>
              <p className="onboarding-lead font-sans">
                When a qualified lead comes in, Orvius texts you a clean summary.
                Use the mobile number you check during the day.
              </p>
              <div className="onboarding-form">
                <label className="onboarding-field font-sans">
                  <span className="onboarding-label">Your mobile number</span>
                  <input
                    type="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                    className="onboarding-input"
                    autoFocus
                  />
                  <span className="onboarding-hint">
                    Standard message rates may apply. Reply STOP to opt out.
                  </span>
                </label>
              </div>
              <div className="onboarding-actions onboarding-actions-split">
                <button
                  type="button"
                  className="btn btn-ghost font-sans"
                  onClick={back}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-void font-sans"
                  disabled={ownerPhone.trim().length < 10}
                  onClick={next}
                >
                  Continue
                </button>
              </div>
            </>
          ) : null}

          {step === "live" ? (
            <>
              <h1 className="onboarding-title font-sans">Go live.</h1>
              <p className="onboarding-lead font-sans">
                Review your setup. Orvius provisions a dedicated line and AI
                receptionist for <strong>{name.trim()}</strong> — callers hear
                your shop name, not the marketing demo.
              </p>
              <dl className="onboarding-review font-sans">
                <div>
                  <dt>Shop</dt>
                  <dd>{name.trim()}</dd>
                </div>
                <div>
                  <dt>Trade</dt>
                  <dd>{trade}</dd>
                </div>
                <div>
                  <dt>Owner alerts</dt>
                  <dd>{ownerPhone.trim()}</dd>
                </div>
                <div>
                  <dt>Plan</dt>
                  <dd>Design partner · {pricing.pilot.period}</dd>
                </div>
              </dl>
              <label className="onboarding-field font-sans">
                <span className="onboarding-label">
                  Opening greeting <span className="onboarding-optional">optional</span>
                </span>
                <textarea
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  placeholder={defaultGreeting}
                  className="onboarding-textarea"
                  rows={3}
                />
              </label>
              <p className="onboarding-footnote font-sans">
                We auto-assign a dedicated local number for {name.trim() || "your shop"} —
                your name, your AI receptionist. No manual setup.
              </p>
              {error ? (
                <p className="onboarding-error font-sans" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="onboarding-actions onboarding-actions-split">
                <button
                  type="button"
                  className="btn btn-ghost font-sans"
                  onClick={back}
                  disabled={submitting}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-void font-sans"
                  disabled={submitting}
                  onClick={finish}
                >
                  {submitting ? "Creating your line…" : "Create my shop line"}
                </button>
              </div>
            </>
          ) : null}

          {provisionedLine ? (
            <OnboardingCallVerify line={provisionedLine} shopName={name.trim()} />
          ) : null}
        </div>
      </div>
    </main>
  );
}
