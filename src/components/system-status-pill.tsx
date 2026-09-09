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
export function SystemStatusPill({ className = "" }: { className?: string }) {
  const [state, setState] = useState<PillState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<PublicStatus>) : null))
      .then((body) => setState(body?.status === "operational" ? "operational" : "degraded"))
      .catch(() => {
        if (!controller.signal.aborted) setState("degraded");
      });
    return () => controller.abort();
  }, []);

  return (
    <span
      className={`ov-status-pill ov-status-pill--${state} ${className}`.trim()}
      data-state={state}
      role="status"
    >
      <span className="ov-status-dot" aria-hidden />
      {COPY[state]}
    </span>
  );
}
