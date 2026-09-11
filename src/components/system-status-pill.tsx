"use client";

import { useEffect, useState } from "react";
import type { PublicStatus } from "@/app/api/status/route";

type PillState = "checking" | "operational" | "degraded";

const COPY: Record<PillState, string> = {
  checking: "CHECKING",
  operational: "OPERATIONAL",
  degraded: "DEGRADED",
};

/**
 * Live system status beside the wordmark.
 *
 * The pill is wired to /api/status rather than hardcoded, because a badge that
 * always says OPERATIONAL is decoration and a visitor can tell. It opens in a
 * neutral "checking" state so a slow or failed probe never renders a green
 * claim we have not confirmed.
 */
/*
  One word is not enough to be honest with.

  The endpoint behind this checks that the app is serving and the database
  answers. It does not — and on this architecture cannot — tell you whether the
  voice line is answering calls, because voice never touches this app. So the
  word stays short and the claim it is making travels with it, as the pill's
  accessible name and its tooltip. A green badge that a shop owner reads as
  "my phone is covered" is worse than no badge, and that reading was available.
*/
const SCOPE_FALLBACK: Record<PillState, string> = {
  checking: "Checking Orvius status",
  operational: "Orvius app and records are reachable",
  degraded: "Orvius app is not fully reachable",
};

export function SystemStatusPill({ className = "" }: { className?: string }) {
  const [state, setState] = useState<PillState>("checking");
  const [scope, setScope] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<PublicStatus>) : null))
      .then((body) => {
        setState(body?.status === "operational" ? "operational" : "degraded");
        if (body?.scope) setScope(body.scope);
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("degraded");
      });
    return () => controller.abort();
  }, []);

  const detail = scope ?? SCOPE_FALLBACK[state];

  return (
    <span
      className={`ov-status-pill ov-status-pill--${state} ${className}`.trim()}
      data-state={state}
      role="status"
      title={detail}
      aria-label={`${COPY[state]} — ${detail}`}
    >
      <span className="ov-status-dot" aria-hidden />
      {COPY[state]}
    </span>
  );
}
