"use client";

import {
  CARRIERS,
  type CaptureMode,
  type CarrierId,
} from "@/lib/carrier-forward";
import { displayPhone } from "@/lib/customer";
import { telHref } from "@/lib/demo-line";
import { useEffect, useMemo, useState } from "react";

type CaptureSetupPanelProps = {
  line: string | null;
  overflowConfirmed: boolean;
  /** Stamped when confirm clears the forward-guide + line-verify gate. */
  overflowProvedAt?: boolean;
  forwardGuideSent?: boolean;
  lineVerified: boolean;
  saving?: boolean;
  initialMode?: CaptureMode | null;
  initialCarrier?: CarrierId | null;
  onConfirmOverflow: (next: boolean) => Promise<void> | void;
  onCapturePathChange?: (next: {
    mode: CaptureMode;
    carrier: CarrierId | null;
  }) => Promise<void> | void;
  onForwardGuideSent?: () => void;
};

/** Owner capture recovery — one primary by state, helpers under More. */
/** Carrier codes take the bare ten digits: *71 + 3125550199, dialed as one string. */
function withLine(step: string, line: string) {
  const tenDigits = line.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return step
    .replace(/(\*{1,2}\d+\*?) \+ your Orvius number/, (_, code: string) => `${code}${tenDigits}`)
    .replace(/(\*{1,2}\d+\*) \+ Orvius digits \+ # \(no \+1\)/, (_, code: string) => `${code}${tenDigits}#`)
    .replace("your Orvius number", displayPhone(line));
}

export function CaptureSetupPanel({
  line,
  overflowConfirmed,
  overflowProvedAt = false,
  forwardGuideSent = false,
  lineVerified,
  saving = false,
  initialMode = "forward",
  initialCarrier = "verizon",
  onConfirmOverflow,
  onCapturePathChange,
  onForwardGuideSent,
}: CaptureSetupPanelProps) {
  const [mode, setMode] = useState<CaptureMode>(initialMode ?? "forward");
  const [carrier, setCarrier] = useState<CarrierId>(
    initialCarrier ?? "verizon",
  );
  const [texting, setTexting] = useState(false);
  const [guideSent, setGuideSent] = useState(forwardGuideSent);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialCarrier) setCarrier(initialCarrier);
  }, [initialCarrier]);

  useEffect(() => {
    setGuideSent(forwardGuideSent);
  }, [forwardGuideSent]);

  const guide = useMemo(
    () => CARRIERS.find((c) => c.id === carrier) ?? CARRIERS[0]!,
    [carrier],
  );

  const forwardNeedsGuide = mode === "forward" && !guideSent;
  const canConfirm =
    Boolean(line) && lineVerified && !forwardNeedsGuide;

  async function persistPath(nextMode: CaptureMode, nextCarrier: CarrierId) {
    if (!onCapturePathChange) return;
    try {
      await onCapturePathChange({
        mode: nextMode,
        carrier: nextMode === "forward" ? nextCarrier : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save capture path");
    }
  }

  function chooseMode(next: CaptureMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    if (overflowConfirmed) {
      void onConfirmOverflow(false);
    }
    void persistPath(next, carrier);
  }

  function chooseCarrier(next: CarrierId) {
    if (next === carrier) return;
    setCarrier(next);
    setError(null);
    void persistPath(mode, next);
  }

  async function copyLine() {
    if (!line) return;
    try {
      await navigator.clipboard.writeText(line);
      setNote("Number copied.");
    } catch {
      setNote(null);
    }
  }

  async function textSteps() {
    if (!line) return;
    setTexting(true);
    setError(null);
    setNote(null);
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
      setGuideSent(true);
      onForwardGuideSent?.();
      setNote(
        data.message ??
          "Texted to your mobile. Call your Orvius line once, then reply DONE.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not text steps");
    } finally {
      setTexting(false);
    }
  }

  return (
    <div className="capture-setup font-sans">
      <p className="account-settings-hint">
        Orvius answers this number. Forward missed calls — or publish it as your
        main shop line.
      </p>

      <p className="account-settings-value mt-3">
        Your Orvius line:{" "}
        {line ?? (
          <span className="text-ash">Provisioning your dedicated number</span>
        )}
      </p>

      <div className="capture-setup-modes mt-4">
        <button
          type="button"
          className={`capture-setup-mode ${mode === "forward" ? "capture-setup-mode-active" : ""}`}
          onClick={() => chooseMode("forward")}
        >
          <strong>Forward my public number</strong>
          <span>Missed &amp; after-hours → Orvius.</span>
        </button>
        <button
          type="button"
          className={`capture-setup-mode ${mode === "publish" ? "capture-setup-mode-active" : ""}`}
          onClick={() => chooseMode("publish")}
        >
          <strong>Make Orvius my main number</strong>
          <span>Google, trucks, and ads use this line.</span>
        </button>
      </div>

      {mode === "forward" ? (
        <>
          <div className="capture-setup-carriers mt-4">
            {CARRIERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`capture-setup-carrier ${carrier === item.id ? "capture-setup-carrier-active" : ""}`}
                onClick={() => chooseCarrier(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <ol className="capture-setup-steps mt-3">
            {guide.steps.map((step) => (
              <li key={step}>
                {line ? withLine(step, line) : step}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <ol className="capture-setup-steps mt-3">
          <li>
            Replace the shop number on Google Business
            {line ? ` with ${line}` : ""}.
          </li>
          <li>Update trucks, invoices, and ads when you can.</li>
          <li>
            Keep the old number forwarded to Orvius until the cutover is done.
          </li>
        </ol>
      )}

      <div className="mt-4">
        {!lineVerified && line ? (
          <a href={telHref(line)} className="btn btn-void text-sm">
            Call to prove it
          </a>
        ) : forwardNeedsGuide ? (
          <button
            type="button"
            className="btn btn-void text-sm"
            disabled={!line || texting}
            onClick={() => void textSteps()}
          >
            {texting ? "Texting…" : "Text me the steps"}
          </button>
        ) : canConfirm && !overflowConfirmed ? (
          <button
            type="button"
            className="btn btn-void text-sm"
            disabled={saving}
            onClick={() => void onConfirmOverflow(true)}
          >
            {saving ? "Saving…" : "Confirm capture"}
          </button>
        ) : overflowConfirmed ? (
          <p className="text-sm text-live" role="status">
            Capture confirmed
            {overflowProvedAt ? " · overflow proved" : ""}
            {lineVerified ? " · line verified" : ""}.
          </p>
        ) : null}
      </div>

      <details className="capture-setup-more mt-4 font-sans">
        <summary>More</summary>
        <div className="capture-setup-more-body mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={!line}
            onClick={() => void copyLine()}
          >
            Copy number
          </button>
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={!line || texting}
            onClick={() => void textSteps()}
          >
            {texting ? "Texting…" : "Text me the steps"}
          </button>
          {line && lineVerified ? (
            <a href={telHref(line)} className="btn btn-ghost text-sm">
              Call again
            </a>
          ) : null}
          <a href="/pilot/forward" className="btn btn-ghost text-sm">
            One-pager
          </a>
        </div>
        {canConfirm ? (
          <label className="mt-4 flex items-start gap-3 text-sm text-void">
            <input
              type="checkbox"
              className="mt-1"
              checked={overflowConfirmed}
              disabled={saving}
              onChange={(e) => void onConfirmOverflow(e.target.checked)}
            />
            <span>
              {mode === "publish"
                ? "Orvius is my published shop number."
                : "I set missed / busy / after-hours forward to Orvius."}
            </span>
          </label>
        ) : null}
      </details>

      {note ? (
        <p className="mt-3 text-sm text-ash" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-signal" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
