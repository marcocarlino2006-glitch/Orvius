"use client";

import {
  buildCarrierDialExample,
  CARRIERS,
  type CaptureMode,
  type CarrierId,
} from "@/lib/carrier-forward";
import { telHref } from "@/lib/demo-line";
import { useEffect, useMemo, useState } from "react";

type CaptureSetupPanelProps = {
  line: string | null;
  overflowConfirmed: boolean;
  lineVerified: boolean;
  saving?: boolean;
  initialMode?: CaptureMode | null;
  initialCarrier?: CarrierId | null;
  onConfirmOverflow: (next: boolean) => Promise<void> | void;
  onCapturePathChange?: (next: {
    mode: CaptureMode;
    carrier: CarrierId | null;
  }) => Promise<void> | void;
};

/** Owner capture recovery — prove call first, then confirm; helpers in More. */
export function CaptureSetupPanel({
  line,
  overflowConfirmed,
  lineVerified,
  saving = false,
  initialMode = "forward",
  initialCarrier = "verizon",
  onConfirmOverflow,
  onCapturePathChange,
}: CaptureSetupPanelProps) {
  const [mode, setMode] = useState<CaptureMode>(initialMode ?? "forward");
  const [carrier, setCarrier] = useState<CarrierId>(
    initialCarrier ?? "verizon",
  );
  const [texting, setTexting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialCarrier) setCarrier(initialCarrier);
  }, [initialCarrier]);

  const guide = useMemo(
    () => CARRIERS.find((c) => c.id === carrier) ?? CARRIERS[0]!,
    [carrier],
  );

  const dialExample = useMemo(
    () => (mode === "forward" ? buildCarrierDialExample(carrier, line) : null),
    [mode, carrier, line],
  );

  const canConfirm = Boolean(line) && lineVerified;

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

  async function copyDial() {
    if (!dialExample) return;
    try {
      await navigator.clipboard.writeText(dialExample);
      setNote(`Dial string copied: ${dialExample}`);
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
        main shop line. Confirm only after a real prove call.
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
          {dialExample ? (
            <p className="capture-setup-dial mt-3 font-sans text-sm text-void">
              Carrier dial try:{" "}
              <code className="tabular-nums">{dialExample}</code>{" "}
              <button
                type="button"
                className="btn btn-ghost text-xs"
                onClick={() => void copyDial()}
              >
                Copy
              </button>
            </p>
          ) : null}
          <ol className="capture-setup-steps mt-3">
            {guide.steps.map((step) => (
              <li key={step}>
                {line ? step.replace(/your Orvius number/g, line) : step}
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
          <li>
            Call the Orvius line once to prove it answers, then confirm below
            (or text DONE from your owner phone).
          </li>
        </ol>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!lineVerified && line ? (
          <a href={telHref(line)} className="btn btn-void text-sm">
            1. Call to prove it
          </a>
        ) : null}
        {line ? (
          <button
            type="button"
            className="btn btn-secondary text-sm"
            disabled={texting}
            onClick={() => void textSteps()}
          >
            {texting ? "Texting…" : "Text me the steps"}
          </button>
        ) : null}
        {canConfirm && !overflowConfirmed ? (
          <button
            type="button"
            className="btn btn-void text-sm"
            disabled={saving}
            onClick={() => void onConfirmOverflow(true)}
          >
            {saving ? "Saving…" : "2. Confirm capture"}
          </button>
        ) : null}
        {overflowConfirmed ? (
          <p className="text-sm text-live self-center" role="status">
            Capture confirmed{lineVerified ? " · line verified" : ""}.
          </p>
        ) : null}
      </div>

      {!lineVerified && line ? (
        <p className="mt-2 text-xs text-ash">
          After the prove call answers, reply DONE from your owner phone — or
          use Confirm capture here.
        </p>
      ) : null}

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
