"use client";

import { useEffect, useState } from "react";
import { ScGroup, ScRow } from "@/components/settings-center/settings-primitives";

type Gate = { id: string; label: string; ok: boolean; detail: string };

type Status = {
  fullyReady: boolean;
  checkoutPublicReady: boolean;
  message: string;
  openGates: Gate[];
};

/**
 * Founder launch gates, shown only in Settings → Internal. /api/bulletproof
 * answers 403 to anyone but the founder, which renders as nothing.
 */
export function FounderGates() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bulletproof")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setStatus(data as Status);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;
  if (status.fullyReady || !status.openGates.length) {
    return (
      <ScGroup title="Launch gates">
        <ScRow label="All green" hint="Self-serve checkout and every launch gate are ready." />
      </ScGroup>
    );
  }

  return (
    <ScGroup title={`Launch gates · ${status.openGates.length} open`}>
      <p className="sc-pad sc-muted">{status.message}</p>
      {status.openGates.map((gate) => (
        <ScRow key={gate.id} label={gate.label} hint={gate.detail} />
      ))}
    </ScGroup>
  );
}
