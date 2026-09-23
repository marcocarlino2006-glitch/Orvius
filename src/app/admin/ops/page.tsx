"use client";

import { FounderManusNext } from "@/components/founder-manus-next";
import { OsShell } from "@/components/os-shell";
import { ShellAlert, ShellPanel } from "@/components/shell-primitives";
import type { ManusPostStep } from "@/lib/manus-post";
import Link from "next/link";
import { useEffect, useState } from "react";

const FOUNDER_CERT = [
  "AC emergency after hours — name, phone, service, urgency, address",
  "Caller asks for a human — 15-min callback offered",
  "Non-urgent estimate — urgency this-week or flexible",
  "Hang-up mid-call — partial lead, no crash",
  "Inbound SMS — lead + auto-reply",
] as const;

function parseCert(raw: string | null | undefined): boolean[] {
  const empty = FOUNDER_CERT.map(() => false);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as boolean[];
    if (Array.isArray(parsed) && parsed.length === FOUNDER_CERT.length) {
      return parsed.map(Boolean);
    }
  } catch {
    /* ignore */
  }
  return empty;
}

type AccountResponse = {
  founder?: boolean;
  business: {
    founderCertJson?: string | null;
  } | null;
  alerts: {
    emailConfigured: boolean;
    smsEnabled: boolean;
  };
  billing?: {
    configured?: boolean;
    fullyReady?: boolean;
  };
};

/**
 * Founder ops plane — Resend, phone cert, Manus next.
 * Never mounted on owner Settings (SHELL-SYSTEM rule 3).
 */
export default function AdminOpsPage() {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [certChecks, setCertChecks] = useState<boolean[]>(() =>
    FOUNDER_CERT.map(() => false),
  );
  const [certSaving, setCertSaving] = useState(false);
  const [manusNext, setManusNext] = useState<ManusPostStep | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account")
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load account");
        return res.json() as Promise<AccountResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        if (!data.founder) {
          setForbidden(true);
          return;
        }
        setAccount(data);
        setCertChecks(parseCert(data.business?.founderCertJson));
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!account?.founder) return;
    let cancelled = false;
    fetch("/api/admin/mastery")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { manusPost?: { next?: ManusPostStep | null } } | null) => {
        if (cancelled) return;
        setManusNext(data?.manusPost?.next ?? null);
      })
      .catch(() => {
        if (!cancelled) setManusNext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [account?.founder]);

  async function persistCert(next: boolean[]) {
    const previous = certChecks;
    setCertChecks(next);
    setCertSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ founderCertJson: JSON.stringify(next) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setCertChecks(previous);
        throw new Error(data.error ?? "Could not save certification");
      }
      try {
        localStorage.setItem("orvius-founder-cert", JSON.stringify(next));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save certification");
    } finally {
      setCertSaving(false);
    }
  }

  async function sendTestAlert() {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await fetch("/api/account/test-alert", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        ok?: boolean;
        message?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      if (!data.ok) {
        throw new Error(data.error ?? "Alert queued but not delivered.");
      }
      setTestResult(data.message ?? "Test alert sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  const certDone = certChecks.filter(Boolean).length;

  if (forbidden) {
    return (
      <OsShell title="Founder ops" subtitle="Internal only">
        <ShellAlert tone="error">
          This page is for the founder allowlist. Shop settings live at{" "}
          <Link href="/dashboard/settings" className="underline">
            Settings
          </Link>
          .
        </ShellAlert>
      </OsShell>
    );
  }

  return (
    <OsShell
      title="Founder ops"
      subtitle="Resend, phone cert, Manus — off the owner Settings path."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="btn btn-secondary text-sm">
            Pipeline
          </Link>
          <Link href="/admin/daily" className="btn btn-secondary text-sm">
            Master all
          </Link>
          <Link href="/dashboard/billing" className="btn btn-void text-sm">
            Billing
          </Link>
        </div>
      }
    >
      <div className="account-stack pro-settings-form max-w-2xl">
        <ShellPanel title="Manus post · next" dense>
          <div id="manus-post-next">
            <FounderManusNext tone="cockpit" next={manusNext} />
          </div>
        </ShellPanel>

        <div id="email-failover">
          <ShellPanel title="Email backup (Resend)" dense>
            {account?.alerts.emailConfigured ? (
              <p className="font-sans text-sm text-live">
                Resend is configured — SMS→email failover can run.
              </p>
            ) : (
              <div className="billing-unblock billing-unblock--instrument font-sans">
                <p className="billing-unblock-kicker">Resend gates</p>
                <p className="billing-unblock-title">
                  SMS→email failover stays dark until these are green
                </p>
                <ol className="billing-unblock-steps">
                  <li>Add RESEND_API_KEY on Vercel</li>
                  <li>
                    Set RESEND_FROM to a verified sender (e.g. Orvius
                    &lt;alerts@orvius.im&gt;)
                  </li>
                  <li>Redeploy · then Send test alert</li>
                </ol>
              </div>
            )}
            <div className="pro-settings-test-row mt-4">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                disabled={testing}
                onClick={() => void sendTestAlert()}
              >
                {testing ? "Sending test…" : "Send test alert"}
              </button>
              <span className="pro-settings-test-meta font-sans">
                SMS {account?.alerts.smsEnabled ? "enabled" : "off"} · Email{" "}
                {account?.alerts.emailConfigured ? "on" : "off"}
              </span>
            </div>
          </ShellPanel>
        </div>

        <div id="founder-cert">
          <ShellPanel
            title={`Phone certification (${certDone}/${FOUNDER_CERT.length})`}
            dense
          >
            <p className="account-settings-hint font-sans mb-3">
              Internal dogfood checklist — not part of the owner go-live ritual.
              {certSaving ? " Saving…" : ""}
            </p>
            <ul className="pro-founder-cert-list">
              {FOUNDER_CERT.map((label, index) => (
                <li key={label}>
                  <label className="pro-founder-cert-item font-sans">
                    <input
                      type="checkbox"
                      checked={certChecks[index] ?? false}
                      onChange={() => {
                        const next = certChecks.map((v, i) =>
                          i === index ? !v : v,
                        );
                        void persistCert(next);
                      }}
                    />
                    <span>{label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </ShellPanel>
        </div>

        <ShellPanel title="Money setup" dense>
          <p className="account-settings-hint font-sans">
            Stripe keys, prices, webhook, and Connect live on Billing — not
            Settings.
          </p>
          <Link href="/dashboard/billing" className="btn btn-secondary text-sm mt-4">
            Open Billing
          </Link>
          {account?.billing?.fullyReady ? (
            <p className="mt-3 font-sans text-sm text-live">Billing fully ready.</p>
          ) : null}
        </ShellPanel>

        {error ? <ShellAlert tone="error">{error}</ShellAlert> : null}
        {testResult ? <ShellAlert tone="success">{testResult}</ShellAlert> : null}
      </div>
    </OsShell>
  );
}
