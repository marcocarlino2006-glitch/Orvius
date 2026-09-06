"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ShellPanel } from "@/components/shell-primitives";

type GoLiveCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  href?: string;
};

type GoLiveResponse = {
  ready: boolean;
  criticalOpen: number;
  checks: GoLiveCheck[];
  line: string | null;
};

/**
 * Sales pilot checklist — env + shop gates before promising the wedge.
 */
export function GoLiveChecklist() {
  const [report, setReport] = useState<GoLiveResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/go-live")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load go-live");
        if (!cancelled) setReport(data as GoLiveResponse);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load go-live");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = report?.checks.filter((c) => !c.ok) ?? [];
  const done = report ? report.checks.length - open.length : 0;

  return (
    <ShellPanel title="Sales go-live checklist">
      <p className="account-settings-hint font-sans">
        Close critical gates before promising capture on a shop&apos;s public number.
        Email failover (Resend) and overflow forward are honesty gates — not theater.
      </p>
      {error ? (
        <p className="mt-3 font-sans text-sm text-ash">{error}</p>
      ) : null}
      {!report && !error ? (
        <p className="mt-3 font-sans text-sm text-ash">Loading checklist…</p>
      ) : null}
      {report ? (
        <>
          <p className="mt-3 font-sans text-sm text-void">
            {done}/{report.checks.length} closed
            {report.criticalOpen > 0
              ? ` · ${report.criticalOpen} critical open — do not oversell`
              : report.ready
                ? " · critical path clear for paid conversion"
                : " · polish remaining honesty gates"}
          </p>
          <ul className="mt-4 space-y-3 font-sans text-sm">
            {report.checks.map((check) => (
              <li key={check.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className={check.ok ? "text-ash" : "text-void"}>
                    <span aria-hidden>{check.ok ? "✓" : "!"}</span> {check.label}
                  </p>
                  <p className="text-xs text-ash">{check.detail}</p>
                </div>
                {!check.ok && check.href ? (
                  <Link href={check.href} className="btn btn-void shrink-0 text-xs">
                    Fix
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-4 font-sans text-xs text-ash">
            Estimate card pay settles on Orvius checkout until Stripe Connect ships —
            say that when demoing money.
          </p>
        </>
      ) : null}
    </ShellPanel>
  );
}
