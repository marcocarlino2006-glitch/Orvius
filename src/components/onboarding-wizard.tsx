"use client";

import { OnboardingCallVerify } from "@/components/onboarding-call-verify";
import { OnboardingCaptureStep } from "@/components/onboarding-capture-step";
import { OrviusLogo } from "@/components/orvius-logo";
import { company } from "@/lib/company";
import { TRADES, type Trade } from "@/lib/trades";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "shop", label: "Shop" },
  { id: "alerts", label: "Alerts" },
  { id: "live", label: "Line" },
] as const;

type StepId = (typeof STEPS)[number]["id"];
type PostProvision = "capture" | "prove" | null;
type ResumePayload = {
  provisioned?: boolean;
  ready?: boolean;
  setup?: { line?: string | null; nextStep?: string };
  business?: {
    name?: string;
    ownerPhone?: string | null;
  } | null;
};

export function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutSessionId = searchParams.get("session_id")?.trim() ?? "";
  const [step, setStep] = useState<StepId>("welcome");
  const [name, setName] = useState("");
  const [trade, setTrade] = useState<Trade>("HVAC");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [greeting, setGreeting] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisionedLine, setProvisionedLine] = useState<string | null>(null);
  const [postProvision, setPostProvision] = useState<PostProvision>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedSms, setAcceptedSms] = useState(false);
  const [resuming, setResuming] = useState(true);

  const resumeExisting = useCallback(async () => {
    const res = await fetch("/api/onboarding");
    if (!res.ok) return false;
    const json = (await res.json()) as ResumePayload;
    if (!json.provisioned || !json.business) return false;

    if (json.ready) {
      router.replace("/dashboard?live=1");
      return true;
    }

    setName(json.business.name?.trim() ?? "");
    setOwnerPhone(json.business.ownerPhone?.trim() ?? "");
    const line = json.setup?.line?.trim() ?? null;
    if (line) {
      setProvisionedLine(line);
      setPostProvision("prove");
      setError(null);
    } else {
      setStep("live");
      setError(
        "Your shop exists, but its line is still provisioning. Open Settings or try again shortly.",
      );
    }
    return true;
  }, [router]);

  useEffect(() => {
    void resumeExisting()
      .catch(() => {
        /* New shops continue with the normal wizard. */
      })
      .finally(() => setResuming(false));
  }, [resumeExisting]);

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
          checkoutSessionId,
        }),
      });

      const json = (await res.json()) as { error?: string; line?: string | null };
      if (!res.ok) {
        if (res.status === 409 && (await resumeExisting())) return;
        setError(json.error ?? "Setup failed. Try again.");
        return;
      }

      if (json.line) {
        setProvisionedLine(json.line);
        setPostProvision("capture");
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

  const inPostFlow = Boolean(provisionedLine && postProvision);

  if (resuming) {
    return (
      <main className="onboarding-shell onboarding-shell--craft onboarding-shell--night">
        <div className="onboarding-glow" aria-hidden />
        <div className="onboarding-frame">
          <header className="onboarding-header">
            <OrviusLogo size="md" variant="void" />
            <p className="onboarding-eyebrow font-sans">
              {company.productName} setup
            </p>
          </header>
          <div className="onboarding-panel" aria-busy="true">
            <p className="onboarding-lead font-sans">Restoring your setup…</p>
          </div>
        </div>
      </main>
    );
  }

  if (!checkoutSessionId && !provisionedLine) {
    return (
      <main className="onboarding-shell onboarding-shell--craft onboarding-shell--night">
        <div className="onboarding-glow" aria-hidden />
        <div className="onboarding-frame">
          <header className="onboarding-header">
            <OrviusLogo size="md" variant="void" />
            <p className="onboarding-eyebrow font-sans">
              {company.productName} setup
            </p>
          </header>
          <div className="onboarding-panel">
            <h1 className="onboarding-title font-sans">Choose your plan first.</h1>
            <p className="onboarding-lead font-sans">
              Paid checkout happens before we provision your dedicated number.
              There is no automatic trial or surprise phone charge.
            </p>
            <div className="onboarding-actions">
              <Link href="/pricing" className="btn btn-void font-sans">
                View paid plans
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="onboarding-shell onboarding-shell--craft onboarding-shell--night">
      <div className="onboarding-glow" aria-hidden />

      <div className="onboarding-frame">
        <header className="onboarding-header">
          <OrviusLogo size="md" variant="void" />
          <p className="onboarding-eyebrow font-sans">{company.productName} setup</p>
        </header>

        {!inPostFlow ? (
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
        ) : null}

        <div className="onboarding-panel">
          {step === "welcome" && !inPostFlow ? (
            <>
              <h1 className="onboarding-title font-sans">
                Your shop line in minutes.
              </h1>
              <p className="onboarding-lead font-sans">
                We create a dedicated number, text you when a job calls, and put
                every lead in one inbox. No second CRM.
              </p>
              <ul className="onboarding-rings font-sans">
                <li>
                  <span className="onboarding-ring-num">01</span>
                  <span>
                    <strong>Get your Orvius number</strong> · Auto-assigned for your shop
                  </span>
                </li>
                <li>
                  <span className="onboarding-ring-num">02</span>
                  <span>
                    <strong>Forward or publish</strong> · Catch missed and after-hours
                  </span>
                </li>
                <li>
                  <span className="onboarding-ring-num">03</span>
                  <span>
                    <strong>Prove it once</strong> · Call the line, get the SMS, work from Command
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

          {step === "shop" && !inPostFlow ? (
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

          {step === "alerts" && !inPostFlow ? (
            <>
              <h1 className="onboarding-title font-sans">Where should we text you?</h1>
              <p className="onboarding-lead font-sans">
                When a qualified lead comes in, Orvius texts a clean summary to
                the phone you check on the job.
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
                    By continuing you consent to transactional SMS from {company.smsProgramName}.
                    Msg &amp; data rates may apply. Reply STOP to opt out · HELP for help. See{" "}
                    <Link href="/sms-terms">SMS Terms</Link>.
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

          {step === "live" && !inPostFlow ? (
            <>
              <h1 className="onboarding-title font-sans">Create your line.</h1>
              <p className="onboarding-lead font-sans">
                Orvius provisions a dedicated number and receptionist for{" "}
                <strong>{name.trim()}</strong> — callers hear your shop name.
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
                  <dd>Paid subscription · verified</dd>
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
                We auto-assign a dedicated local number — no phone-console setup, no
                shared demo line. Callers may hear a short recording/AI disclosure
                required by law in some jurisdictions.
              </p>
              <div className="onboarding-consent font-sans">
                <label className="onboarding-check">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                  />
                  <span>
                    I agree to the{" "}
                    <Link href="/terms">Terms of Service</Link>,{" "}
                    <Link href="/privacy">Privacy Policy</Link>, and{" "}
                    <Link href="/refunds">Refunds &amp; Cancellation</Link> policy.
                  </span>
                </label>
                <label className="onboarding-check">
                  <input
                    type="checkbox"
                    checked={acceptedSms}
                    onChange={(e) => setAcceptedSms(e.target.checked)}
                  />
                  <span>
                    I consent to receive transactional SMS owner alerts at the number above
                    from {company.smsProgramName}. Consent is not a condition of purchase
                    except for receiving those alerts. Reply STOP to cancel.{" "}
                    <Link href="/sms-terms">SMS Terms</Link>.
                  </span>
                </label>
              </div>
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
                  disabled={submitting || !acceptedTerms || !acceptedSms}
                  onClick={finish}
                >
                  {submitting ? "Creating your line…" : "Create my shop line"}
                </button>
              </div>
            </>
          ) : null}

          {provisionedLine && postProvision === "capture" ? (
            <OnboardingCaptureStep
              line={provisionedLine}
              shopName={name.trim()}
              onContinue={() => setPostProvision("prove")}
            />
          ) : null}

          {provisionedLine && postProvision === "prove" ? (
            <OnboardingCallVerify line={provisionedLine} shopName={name.trim()} />
          ) : null}
        </div>
      </div>
    </main>
  );
}
