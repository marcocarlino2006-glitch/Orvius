"use client";

import { useEffect, useState } from "react";
import { ScGroup, ScRow } from "./settings-primitives";

type Status = {
  password: { set: boolean };
  twoStep: { enabled: boolean; enabledAt: string | null; recoveryLeft: number };
};

type Setup = { setupKey: string; uri: string; qr: string };

type Panel = "none" | "password" | "setup" | "codes" | "disable" | "regenerate";

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/account/security", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "That did not save. Nothing changed.");
  return data;
}

/** Password and two-step sign-in for the signed-in person. */
export function SecurityGroup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/account/security", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Status | null) => data && setStatus(data))
      .catch(() => undefined);
  }, []);

  function open(nextPanel: Panel) {
    setPanel(nextPanel);
    setError(null);
    setNotice(null);
    setCode("");
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;
  const twoStep = status.twoStep;

  return (
    <>
      <ScGroup title="Password">
        <ScRow
          label="Password"
          hint={status.password.set ? "You can sign in with your email and password." : "You sign in with Google or an email link. Add a password to sign in without them."}
        >
          {panel === "password" ? null : (
            <button type="button" className="sc-btn" onClick={() => open("password")}>
              {status.password.set ? "Change password" : "Set a password"}
            </button>
          )}
        </ScRow>
        {panel === "password" ? (
          <form
            className="sc-security-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (next !== confirm) {
                setError("The new passwords don't match.");
                return;
              }
              void run(async () => {
                const data = await call({ action: "password", current: current || undefined, next });
                setStatus(data);
                open("none");
                setNotice("Password saved.");
              });
            }}
          >
            {status.password.set ? (
              <input className="sc-input" type="password" autoComplete="current-password" aria-label="Current password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            ) : null}
            <input className="sc-input" type="password" autoComplete="new-password" aria-label="New password" placeholder="New password (8+ characters)" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
            <input className="sc-input" type="password" autoComplete="new-password" aria-label="Confirm new password" placeholder="Type it again" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <div className="sc-security-actions">
              <button type="submit" className="sc-btn sc-btn--primary" disabled={busy}>
                {busy ? "Saving…" : "Save password"}
              </button>
              <button type="button" className="sc-btn" disabled={busy} onClick={() => open("none")}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </ScGroup>

      <ScGroup title="Two-step sign-in">
        <ScRow
          label={twoStep.enabled ? "On" : "Off"}
          hint={
            twoStep.enabled
              ? `Signing in with a password or an email link also asks for a code from your authenticator app. ${twoStep.recoveryLeft} recovery code${twoStep.recoveryLeft === 1 ? "" : "s"} left.`
              : "Add a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy) when you sign in with a password or an email link."
          }
        >
          {panel === "none" || panel === "password" ? (
            twoStep.enabled ? (
              <span className="sc-security-actions">
                <button type="button" className="sc-btn" onClick={() => open("regenerate")}>
                  New recovery codes
                </button>
                <button type="button" className="sc-btn" onClick={() => open("disable")}>
                  Turn off
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="sc-btn sc-btn--primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const data = await call({ action: "two_step_start" });
                    setSetup(data);
                    open("setup");
                  })
                }
              >
                Turn on
              </button>
            )
          ) : null}
        </ScRow>

        {panel === "setup" && setup ? (
          <form
            className="sc-security-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const data = await call({ action: "two_step_confirm", code });
                setStatus(data);
                setCodes(data.recoveryCodes ?? []);
                setSetup(null);
                open("codes");
              });
            }}
          >
            <p className="sc-muted">1. Scan this with your authenticator app, or on this phone tap “Open in app”.</p>
            <div className="sc-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code for your authenticator app" width={168} height={168} />
              <div className="sc-qr-copy">
                <span className="sc-muted">Or type this key:</span>
                <code className="sc-setup-key">{setup.setupKey}</code>
                <a className="sc-btn" href={setup.uri}>
                  Open in app
                </a>
              </div>
            </div>
            <p className="sc-muted">2. Enter the 6-digit code it shows.</p>
            <div className="sc-security-actions">
              <input className="sc-input sc-input--code" inputMode="numeric" autoComplete="one-time-code" aria-label="6-digit code" placeholder="123456" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
              <button type="submit" className="sc-btn sc-btn--primary" disabled={busy}>
                {busy ? "Checking…" : "Turn on"}
              </button>
              <button type="button" className="sc-btn" disabled={busy} onClick={() => open("none")}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {panel === "codes" ? (
          <div className="sc-security-form">
            <p className="sc-muted">
              Save these recovery codes somewhere safe. Each one works once if you lose your phone. This is the only
              time they&apos;re shown.
            </p>
            <ul className="sc-recovery" aria-label="Recovery codes">
              {codes.map((c) => (
                <li key={c}>
                  <code>{c}</code>
                </li>
              ))}
            </ul>
            <div className="sc-security-actions">
              <button
                type="button"
                className="sc-btn"
                onClick={() => void navigator.clipboard?.writeText(codes.join("\n")).then(() => setNotice("Copied."))}
              >
                Copy codes
              </button>
              <button type="button" className="sc-btn sc-btn--primary" onClick={() => { setCodes([]); open("none"); setNotice("Two-step sign-in is on."); }}>
                I saved them
              </button>
            </div>
          </div>
        ) : null}

        {panel === "disable" || panel === "regenerate" ? (
          <form
            className="sc-security-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (panel === "disable") {
                  const data = await call({ action: "two_step_disable", code });
                  setStatus(data);
                  open("none");
                  setNotice("Two-step sign-in is off.");
                } else {
                  const data = await call({ action: "recovery_codes", code });
                  setStatus(data);
                  setCodes(data.recoveryCodes ?? []);
                  open("codes");
                }
              });
            }}
          >
            <p className="sc-muted">
              {panel === "disable"
                ? "Enter your app's current code, or a recovery code, to turn two-step off."
                : "Enter your app's current code. Your old recovery codes stop working."}
            </p>
            <div className="sc-security-actions">
              <input className="sc-input sc-input--code" autoComplete="one-time-code" aria-label="Code" placeholder="123456" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} required />
              <button type="submit" className="sc-btn sc-btn--primary" disabled={busy}>
                {busy ? "Checking…" : panel === "disable" ? "Turn off" : "Make new codes"}
              </button>
              <button type="button" className="sc-btn" disabled={busy} onClick={() => open("none")}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        <p className="sc-muted sc-group-note">
          Signing in with Google uses your Google account&apos;s own 2-Step Verification instead.
        </p>
        {error ? <p className="sc-banner sc-banner--error" role="alert">{error}</p> : null}
        {notice ? <p className="sc-banner" role="status">{notice}</p> : null}
      </ScGroup>
    </>
  );
}
