"use client";

import { OnboardingCallVerify } from "@/components/onboarding-call-verify";
import { OrviusLogo } from "@/components/orvius-logo";
import { company } from "@/lib/company";
import { readPreviewDraft } from "@/lib/preview-draft";
import { TRADES, type Trade } from "@/lib/trades";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ResumePayload = {
  provisioned?: boolean;
  checkoutSessionId?: string | null;
  ready?: boolean;
  setup?: { line?: string | null; nextStep?: string };
  business?: {
    name?: string;
    ownerPhone?: string | null;
  } | null;
};

/**
 * Frictionless tunnel: one form → create line → one call → Command.
 * No welcome rings, no separate alerts/live screens, no capture teach-before-prove.
 */
export function OnboardingWizard({ checkoutOpen = true }: { checkoutOpen?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("session_id")?.trim() ?? "";
  const [recoveredSessionId, setRecoveredSessionId] = useState("");
  const checkoutSessionId = urlSessionId || recoveredSessionId;
  const [name, setName] = useState("");
  const [trade, setTrade] = useState<Trade>("HVAC");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provisionedLine, setProvisionedLine] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedSms, setAcceptedSms] = useState(false);
  const [resuming, setResuming] = useState(true);
  const [areaCode, setAreaCode] = useState("");
  const [areaCodeTouched, setAreaCodeTouched] = useState(false);
  const [numbers, setNumbers] = useState<string[] | null>(null);
  const [numbersSearchable, setNumbersSearchable] = useState(true);
  const [searching, setSearching] = useState(false);
  const [pickedNumber, setPickedNumber] = useState<string | null>(null);

  useEffect(() => {
    if (areaCodeTouched) return;
    const digits = ownerPhone.replace(/\D/g, "");
    const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (national.length === 10 && /^[2-9]/.test(national)) setAreaCode(national.slice(0, 3));
  }, [ownerPhone, areaCodeTouched]);

  useEffect(() => {
    setNumbers(null);
    setPickedNumber(null);
  }, [areaCode]);

  async function searchNumbers() {
    if (!/^[2-9]\d{2}$/.test(areaCode)) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/onboarding/numbers?areaCode=${areaCode}`);
      const json = (await res.json()) as { numbers?: string[]; searchable?: boolean };
      setNumbers(json.numbers ?? []);
      setNumbersSearchable(json.searchable !== false);
      setPickedNumber(json.numbers?.[0] ?? null);
    } catch {
      setNumbers([]);
      setNumbersSearchable(false);
    } finally {
      setSearching(false);
    }
  }

  const resumeExisting = useCallback(async () => {
    const res = await fetch("/api/onboarding?resume=1");
    if (!res.ok) return false;
    const json = (await res.json()) as ResumePayload;
    if (!json.provisioned || !json.business) {
      if (json.checkoutSessionId) setRecoveredSessionId(json.checkoutSessionId);
      return false;
    }

    if (json.ready) {
      router.replace("/dashboard?live=1");
      return true;
    }

    setName(json.business.name?.trim() ?? "");
    setOwnerPhone(json.business.ownerPhone?.trim() ?? "");
    const line = json.setup?.line?.trim() ?? null;
    if (line) {
      setProvisionedLine(line);
      setError(null);
    } else {
      setError(
        "Your shop exists, but its line is still provisioning. Try again in a moment.",
      );
    }
    return true;
  }, [router]);

  useEffect(() => {
    void resumeExisting()
      .then((resumed) => {
        if (resumed) return;
        const draft = readPreviewDraft();
        if (draft?.shopName) setName((current) => current || draft.shopName);
        if (draft?.ownerPhone) setOwnerPhone((current) => current || draft.ownerPhone);
      })
      .catch(() => {
        /* New shops continue with the normal form. */
      })
      .finally(() => setResuming(false));
  }, [resumeExisting]);

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
          checkoutSessionId,
          ...(/^[2-9]\d{2}$/.test(areaCode) ? { areaCode } : {}),
          ...(pickedNumber ? { phoneNumber: pickedNumber } : {}),
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

  const canCreate =
    name.trim().length >= 2 &&
    ownerPhone.trim().length >= 10 &&
    acceptedTerms &&
    acceptedSms &&
    !submitting;

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
            <p className="onboarding-lead font-sans">Opening setup…</p>
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
            {checkoutOpen ? (
              <>
                <h1 className="onboarding-title font-sans">Pay first, then your line.</h1>
                <p className="onboarding-lead font-sans">
                  One paid plan unlocks a dedicated number. No surprise phone charge.
                </p>
                <div className="onboarding-actions">
                  <Link href="/pricing" className="btn btn-void font-sans">
                    Pay with card
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="onboarding-title font-sans">We set up new shops with you.</h1>
                <p className="onboarding-lead font-sans">
                  Card signup isn&apos;t open yet. Book a call audit and we&apos;ll get your line answering with you on the call.
                </p>
                <div className="onboarding-actions">
                  <Link href="/pilot" className="btn btn-void font-sans">
                    Book a call audit
                  </Link>
                </div>
              </>
            )}
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

        <div className="onboarding-panel">
          {provisionedLine ? (
            <OnboardingCallVerify line={provisionedLine} shopName={name.trim() || "your shop"} />
          ) : (
            <>
              <h1 className="onboarding-title font-sans">Get your shop line.</h1>
              <p className="onboarding-lead font-sans">
                Enter your shop name and mobile. We assign your number, then one test call lets you hear it answer.
              </p>

              <div className="onboarding-form">
                <label className="onboarding-field font-sans">
                  <span className="onboarding-label">Shop name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your shop name"
                    className="onboarding-input"
                    autoFocus
                    autoComplete="organization"
                  />
                </label>

                <fieldset className="onboarding-field font-sans">
                  <legend className="onboarding-label">Trade</legend>
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

                <label className="onboarding-field font-sans">
                  <span className="onboarding-label">Your mobile</span>
                  <input
                    type="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                    className="onboarding-input"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                  <span className="onboarding-hint">
                    Orvius texts job alerts here. Reply STOP to opt out ·{" "}
                    <Link href="/sms-terms">SMS Terms</Link>.
                  </span>
                </label>

                <div className="onboarding-field font-sans">
                  <label className="onboarding-label" htmlFor="onboarding-area-code">
                    Area code for your Orvius number
                  </label>
                  <div className="onboarding-area-row">
                    <input
                      id="onboarding-area-code"
                      type="text"
                      value={areaCode}
                      onChange={(e) => {
                        setAreaCodeTouched(true);
                        setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3));
                      }}
                      placeholder="512"
                      className="onboarding-input onboarding-area-input"
                      inputMode="numeric"
                      maxLength={3}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost font-sans"
                      disabled={!/^[2-9]\d{2}$/.test(areaCode) || searching}
                      onClick={() => void searchNumbers()}
                    >
                      {searching ? "Checking…" : "See numbers"}
                    </button>
                  </div>
                  {numbers && numbers.length > 0 ? (
                    <div className="onboarding-trade-grid" role="radiogroup" aria-label="Available numbers">
                      {numbers.map((item) => (
                        <button
                          key={item}
                          type="button"
                          role="radio"
                          aria-checked={pickedNumber === item}
                          className={`onboarding-trade ${pickedNumber === item ? "onboarding-trade-active" : ""}`}
                          onClick={() => setPickedNumber(item)}
                        >
                          {formatLine(item)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <span className="onboarding-hint" aria-live="polite">
                    {numbers === null
                      ? "Callers see this number. Keep your existing number and forward to it, or put it on your trucks."
                      : !numbersSearchable
                        ? "We couldn't check numbers right now. We'll assign one in this area code when you create your line."
                        : numbers.length === 0
                          ? `No numbers left in ${areaCode}. Try a nearby area code, or we'll assign the closest available US number.`
                          : "If your pick is taken before you finish, we'll assign another in the same area code."}
                  </span>
                </div>
              </div>

              <p className="onboarding-footnote font-sans">
                Paid subscription · verified. We assign a dedicated local number —
                callers hear your shop name.
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
                    <Link href="/terms">Terms</Link>,{" "}
                    <Link href="/privacy">Privacy</Link>, and{" "}
                    <Link href="/refunds">Refunds</Link>.
                  </span>
                </label>
                <label className="onboarding-check">
                  <input
                    type="checkbox"
                    checked={acceptedSms}
                    onChange={(e) => setAcceptedSms(e.target.checked)}
                  />
                  <span>
                    I consent to transactional SMS alerts from {company.smsProgramName}{" "}
                    at this number.{" "}
                    <Link href="/sms-terms">SMS Terms</Link>.
                  </span>
                </label>
              </div>

              {error ? (
                <p className="onboarding-error font-sans" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="btn btn-void onboarding-btn-primary font-sans"
                  disabled={!canCreate}
                  onClick={() => void finish()}
                >
                  {submitting ? "Creating your line…" : "Create my shop line"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function formatLine(e164: string): string {
  const digits = e164.replace(/\D/g, "").slice(-10);
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : e164;
}
