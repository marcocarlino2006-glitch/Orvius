"use client";

import {
  CARRIERS,
  type CaptureMode,
  type CarrierId,
} from "@/lib/carrier-forward";
import { telHref } from "@/lib/demo-line";
import { useMemo, useState } from "react";

type CaptureSetupPanelProps = {
  line: string | null;
  overflowConfirmed: boolean;
  lineVerified: boolean;
  saving?: boolean;
  onConfirmOverflow: (next: boolean) => Promise<void> | void;
};

/** Owner capture setup: forward vs publish, carrier steps, text-me, confirm. */
export function CaptureSetupPanel({
  line,
  overflowConfirmed,
  lineVerified,
  saving = false,
  onConfirmOverflow,
}: CaptureSetupPanelProps) {
  const [mode, setMode] = useState<CaptureMode>("forward");
  const [carrier, setCarrier] = useState<CarrierId>("verizon");
  const [texting, setTexting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guide = useMemo(
    () => CARRIERS.find((c) => c.id === carrier) ?? CARRIERS[0]!,
    [carrier],
  );

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
      setNote(
        data.message ?? "Texted to your mobile. Reply DONE when finished.",
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
        Orvius answers this number. Catch missed and after-hours by forwarding —
        or publish it as your main shop line.
      </p>

      <p className="account-settings-value mt-3">
        Your Orvius line: {line ?? "Assigning…"}
      </p>

      <div className="capture-setup-modes mt-4">
        <button
          type="button"
          className={`capture-setup-mode ${mode === "forward" ? "capture-setup-mode-active" : ""}`}
          onClick={() => setMode("forward")}
        >
          <strong>Forward my public number</strong>
          <span>Keep Google / trucks. Missed &amp; after-hours → Orvius.</span>
        </button>
        <button
          type="button"
          className={`capture-setup-mode ${mode === "publish" ? "capture-setup-mode-active" : ""}`}
          onClick={() => setMode("publish")}
        >
          <strong>Make Orvius my main number</strong>
          <span>Put this number on Google, trucks, and ads.</span>
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
                onClick={() => setCarrier(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <ol className="capture-setup-steps mt-3">
            {guide.steps.map((step) => (
              <li key={step}>
                {line ? step.replace("your Orvius number", line) : step}
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

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary text-sm"
          disabled={!line}
          onClick={() => void copyLine()}
        >
          Copy forward-to number
        </button>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          disabled={!line || texting}
          onClick={() => void textSteps()}
        >
          {texting ? "Texting…" : "Text me the steps"}
        </button>
        {line ? (
          <a href={telHref(line)} className="btn btn-void text-sm">
            Call to prove it
          </a>
        ) : null}
        <a href="/pilot/forward" className="btn btn-ghost text-sm">
          One-pager
        </a>
      </div>

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

      <label className="mt-4 flex items-start gap-3 text-sm text-void">
        <input
          type="checkbox"
          className="mt-1"
          checked={overflowConfirmed}
          disabled={saving || !line}
          onChange={(e) => void onConfirmOverflow(e.target.checked)}
        />
        <span>
          {mode === "publish"
            ? "Orvius is (or will be) my published shop number."
            : "I set missed / busy / after-hours forward to Orvius — or I will before go-live."}
          {lineVerified ? " · Line verified with a real call." : ""}
        </span>
      </label>
    </div>
  );
}
