"use client";

import { useEffect } from "react";

type BeaconEvent = "pricing" | "signup" | "setup" | "pay";

/** Counts one view of a funnel page. No cookie, no storage; skipped under Do Not Track or Global Privacy Control. */
export function FunnelBeacon({ event, detail }: { event: BeaconEvent; detail?: string | null }) {
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.globalPrivacyControl || nav.doNotTrack === "1") return;
    const body = JSON.stringify({ event, ...(detail ? { detail } : {}) });
    const blob = new Blob([body], { type: "application/json" });
    if (nav.sendBeacon?.("/api/funnel", blob)) return;
    void fetch("/api/funnel", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
  }, [event, detail]);
  return null;
}
