"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Gate = { id: string; label: string; ok: boolean; detail: string };

type Status = {
  fullyReady: boolean;
  checkoutPublicReady: boolean;
  postLock: boolean;
  message: string;
  openGates: Gate[];
};

/**
 * Fail-closed founder banner — Manus bar.
 * Stays up until Stripe + formation are green so we never soft-launch cash claims.
 */
export function PostLockBanner() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bulletproof")
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data) setStatus(data as Status);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || status.fullyReady) return null;

  const cashOpen = status.openGates.filter(
    (g) => g.id.startsWith("stripe") || g.id === "billing_full",
  );
  const legalOpen = status.openGates.filter((g) => g.id === "formation");

  return (
    <section className="post-lock-banner font-sans" role="status" aria-live="polite">
      <p className="post-lock-kicker">POST LOCK · Manus bar</p>
      <p className="post-lock-message">{status.message}</p>
      <ul className="post-lock-gates">
        {status.openGates.map((gate) => (
          <li key={gate.id}>
            <strong>{gate.label}</strong> — {gate.detail}
          </li>
        ))}
      </ul>
      <div className="post-lock-actions">
        {!status.checkoutPublicReady ? (
          <Link href="/dashboard/billing" className="btn btn-void text-sm">
            Unblock Stripe
          </Link>
        ) : null}
        {legalOpen.length > 0 ? (
          <span className="post-lock-hint">
            Reply with LLC formation state (one word) — never invent it.
          </span>
        ) : null}
        {cashOpen.length > 0 ? (
          <span className="post-lock-hint">
            Pilot/outreach OK. Do not claim self-serve paid checkout yet.
          </span>
        ) : null}
      </div>
    </section>
  );
}
