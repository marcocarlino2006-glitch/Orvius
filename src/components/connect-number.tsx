"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PortRequestForm } from "@/components/port-request-form";
import { StatusDot } from "@/components/status-dot";
import { CARRIERS, type CarrierId } from "@/lib/carrier-forward";
import { displayPhone } from "@/lib/customer";
import {
  CARRIER_PATHS,
  COVERAGE_DETAIL,
  COVERAGE_LABEL,
  NUMBER_OWNERSHIP,
  PORT_OUT_RIGHTS,
  connectSteps,
  dialHref,
  disconnectSteps,
  forwardingCodes,
  type ConnectionHealth,
  type Coverage,
} from "@/lib/number-connection";

type Connection = {
  line: string | null;
  businessNumber: string | null;
  carrier: CarrierId | null;
  coverage: Coverage | null;
  provenAt: string | null;
  confirmedAt: string | null;
  testMode: boolean;
  lastTest: { state: string; title: string; at: string } | null;
  health: ConnectionHealth;
};

type Test = { id: string; state: string; title: string; fix: string | null };

const TONE: Record<ConnectionHealth["state"], "good" | "risk" | "attention" | "neutral"> = {
  proven: "good",
  test_failed: "risk",
  no_line: "risk",
  not_proven: "attention",
  test_mode: "neutral",
};

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <li className={`cn-step${done ? " is-done" : ""}`}>
      <p className="cn-step-title">
        <span className="cn-step-n" aria-hidden>
          {done ? "✓" : n}
        </span>
        {title}
      </p>
      <div className="cn-step-body">{children}</div>
    </li>
  );
}

/**
 * Connect your number → choose coverage → test → activate. Guided, because
 * Orvius can't change a carrier's settings; proven by a real test call,
 * because a receiving number existing doesn't mean the shop's calls reach it.
 */
export function ConnectNumber({ onConfirmManually }: { onConfirmManually?: (next: boolean) => Promise<void> | void }) {
  const [conn, setConn] = useState<Connection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [texted, setTexted] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/account/connection", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Connection;
      setConn(data);
      setNumber(data.businessNumber ? displayPhone(data.businessNumber) : "");
    } catch {
      setLoadError("Your connection details didn't load. Nothing changed.");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (poll.current) clearTimeout(poll.current);
    };
  }, [load]);

  async function save(patch: { businessNumber?: string; carrier?: CarrierId; coverage?: Coverage }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as Connection & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "That didn't save. Try again.");
      setConn(data);
      if (patch.businessNumber !== undefined) setNumber(data.businessNumber ? displayPhone(data.businessNumber) : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function check(id: string, tries = 0) {
    try {
      const res = await fetch(`/api/account/connection/test?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = (await res.json()) as Test & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "The test result didn't load.");
      setTest(data);
      if (data.state === "calling" && tries < 30) {
        poll.current = setTimeout(() => void check(id, tries + 1), 3000);
      } else {
        void load();
      }
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "The test result didn't load.");
    }
  }

  async function runTest() {
    setTestError(null);
    setTest(null);
    try {
      const res = await fetch("/api/account/connection/test", { method: "POST" });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "The test didn't start. Nothing was dialed.");
      setTest({ id: data.id, state: "calling", title: "Calling your business number… don't answer it.", fix: null });
      poll.current = setTimeout(() => void check(data.id!), 3000);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "The test didn't start. Nothing was dialed.");
    }
  }

  async function textSteps() {
    if (!conn) return;
    setTexted(null);
    try {
      const res = await fetch("/api/account/forward-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: conn.coverage === "main" ? "publish" : "forward", carrier: conn.carrier ?? undefined }),
      });
      const data = (await res.json()) as { error?: string };
      setTexted(res.ok ? "Sent to your mobile." : data.error ?? "That text didn't send. The steps are on screen.");
    } catch {
      setTexted("That text didn't send. The steps are on screen.");
    }
  }

  if (loadError) {
    return (
      <div className="cn font-sans" role="alert">
        <p className="cn-error">{loadError}</p>
        <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }
  if (!conn) {
    return (
      <div className="cn font-sans" aria-busy>
        <span className="skeleton cn-skel" />
        <span className="skeleton cn-skel" />
      </div>
    );
  }

  const line = conn.line;
  const carrier = conn.carrier;
  const coverage = conn.coverage;
  const path = carrier ? CARRIER_PATHS[carrier] : null;
  const codes = carrier && coverage && line ? forwardingCodes(carrier, coverage, line) : null;
  const proven = conn.health.state === "proven";
  const hasNumber = Boolean(conn.businessNumber) || coverage === "main";
  const testing = test?.state === "calling";
  const showFallback = testError != null || (test && test.state !== "calling" && test.state !== "reached");

  return (
    <div className="cn font-sans">
      <div className={`cn-health cn-health--${conn.health.state}`} role="status">
        <StatusDot tone={TONE[conn.health.state]}>{conn.health.label}</StatusDot>
        <span className="cn-muted">{conn.health.detail}</span>
      </div>

      <ol className="cn-steps">
        <Step n={1} title="Connect your number" done={hasNumber && Boolean(carrier)}>
          <p className="cn-muted">
            Orvius answers on {line ? <strong className="cn-mono">{displayPhone(line)}</strong> : "your Orvius line once it's ready"}. Tell us the
            number customers call today and who provides it.
          </p>
          <form
            className="cn-row"
            onSubmit={(e) => {
              e.preventDefault();
              void save({ businessNumber: number });
            }}
          >
            <label className="cn-field">
              <span className="cn-label">Business number</span>
              <input
                className="cn-input"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(555) 555-0100"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </label>
            <button type="submit" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
          <div className="cn-chips" role="radiogroup" aria-label="Who provides the number">
            {CARRIERS.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={carrier === c.id}
                className={`cn-chip${carrier === c.id ? " is-on" : ""}`}
                onClick={() => void save({ carrier: c.id })}
              >
                {c.label}
              </button>
            ))}
          </div>
          {path ? <p className="cn-note">{path.howItWorks}</p> : null}
        </Step>

        <Step n={2} title="Choose what Orvius answers" done={Boolean(coverage)}>
          <div className="cn-options" role="radiogroup" aria-label="Coverage">
            {(path?.coverages ?? (["missed", "all", "main"] as Coverage[])).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={coverage === c}
                className={`cn-option${coverage === c ? " is-on" : ""}`}
                onClick={() => void save({ coverage: c })}
              >
                <span className="cn-option-title">
                  {COVERAGE_LABEL[c]}
                  {c === "missed" ? <span className="cn-tag">Recommended</span> : null}
                </span>
                <span className="cn-option-detail">{COVERAGE_DETAIL[c]}</span>
              </button>
            ))}
          </div>
          {carrier && carrier !== "voip" && coverage !== "main" ? (
            <p className="cn-note">Cell carriers can&apos;t forward on a schedule. &ldquo;Calls I don&apos;t answer&rdquo; covers after hours whenever nobody picks up.</p>
          ) : null}
          {coverage && carrier && line ? (
            <>
              <ol className="cn-list">
                {connectSteps(carrier, coverage, line).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
              <div className="cn-row">
                {codes ? (
                  <a href={dialHref(codes.on)} className="ox-btn ox-btn--primary ox-btn--sm">
                    Dial {codes.on}
                  </a>
                ) : null}
                <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => void textSteps()}>
                  Text me these steps
                </button>
                {texted ? <span className="cn-muted">{texted}</span> : null}
              </div>
              {codes ? <p className="cn-note">The dial button works from the phone that owns your business number.</p> : null}
            </>
          ) : null}
        </Step>

        <Step n={3} title="Test it" done={proven}>
          {conn.testMode ? (
            <p className="cn-muted">Test mode doesn&apos;t place real calls. Go live, then run this test.</p>
          ) : coverage === "main" ? (
            <p className="cn-muted">Call {line ? displayPhone(line) : "your Orvius number"} from any phone. When Orvius answers, it&apos;s working.</p>
          ) : (
            <>
              <p className="cn-muted">
                Orvius calls {conn.businessNumber ? displayPhone(conn.businessNumber) : "your business number"} and waits for the call to come
                through. Don&apos;t answer it. It takes up to a minute.
              </p>
              <div className="cn-row">
                <button
                  type="button"
                  className="ox-btn ox-btn--primary ox-btn--sm"
                  disabled={testing || !conn.businessNumber || !coverage || !line}
                  onClick={() => void runTest()}
                >
                  {testing ? "Testing…" : test ? "Test again" : "Call my business number"}
                </button>
              </div>
            </>
          )}
          {test ? (
            <div className={`cn-result cn-result--${test.state}`} role="status">
              <p className="cn-result-title">{test.title}</p>
              {test.fix ? <p className="cn-muted">{test.fix}</p> : null}
            </div>
          ) : null}
          {testError ? (
            <p className="cn-error" role="alert">
              {testError}
            </p>
          ) : null}
          {showFallback && onConfirmManually && !proven ? (
            <details className="cn-more">
              <summary>Checked it another way?</summary>
              <p className="cn-muted">
                If you called your business number from another phone and Orvius answered, you can mark it working. Orvius still marks it
                proven on its own when a forwarded call comes through.
              </p>
              <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={() => void Promise.resolve(onConfirmManually(true)).then(load)}>
                Orvius answered my test
              </button>
            </details>
          ) : null}
        </Step>

        <Step n={4} title="Activate" done={proven && !conn.testMode}>
          {conn.testMode ? (
            <p className="cn-muted">
              Going live gives you a real Orvius line and turns on real texts.{" "}
              <Link href="/dashboard/onboarding?step=live">Go live</Link>
            </p>
          ) : proven ? (
            <p className="cn-muted">
              {coverage === "all" || coverage === "main"
                ? "Orvius answers your calls now."
                : "Orvius answers the calls you miss now. Command shows if that ever stops."}
            </p>
          ) : (
            <p className="cn-muted">Orvius treats the connection as working once a test call or a real forwarded call comes through.</p>
          )}
        </Step>
      </ol>

      <details className="cn-more">
        <summary>Turn it off or move your number</summary>
        <p className="cn-muted">{NUMBER_OWNERSHIP}</p>
        {carrier && coverage && line ? (
          <ul className="cn-list">
            {disconnectSteps(carrier, coverage, line).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : null}
        <p className="cn-muted">{PORT_OUT_RIGHTS}</p>
        <details className="cn-more">
          <summary>Move my number to Orvius (optional)</summary>
          <PortRequestForm />
        </details>
      </details>

      {error ? (
        <p className="cn-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
