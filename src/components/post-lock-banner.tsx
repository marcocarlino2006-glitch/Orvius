"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
 * Founder post-lock instrument.
 * Compact on Settings. Full only on Billing. Never crowds Command/Today.
 *
 * Who may see it is decided by /api/bulletproof, which returns 403 to anyone
 * who is not the founder. A non-ok response reads as "nothing to show" below,
 * so an owner gets no banner and no round trip worth reading.
 */
export function PostLockBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);

  const onBilling = pathname?.startsWith("/dashboard/billing");
  const onSettings = pathname?.startsWith("/dashboard/settings");
  const show = onBilling || onSettings;

  useEffect(() => {
    if (!show) return;
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
  }, [show]);

  if (!show || !status || status.fullyReady) return null;

  const openCount = status.openGates.length;

  // Settings: one quiet line — don't compete with the owner ritual
  if (onSettings && !onBilling) {
    return (
      <p className="post-lock-strip font-sans" role="status">
        <span className="post-lock-strip-label">Post lock</span>
        <span className="post-lock-strip-copy">
          {openCount} founder gate{openCount === 1 ? "" : "s"} still open — billing
          claims stay dark.
        </span>
        <Link href="/dashboard/billing" className="post-lock-strip-link">
          Review
        </Link>
      </p>
    );
  }

  const cashOpen = status.openGates.filter(
    (g) => g.id.startsWith("stripe") || g.id === "billing_full",
  );
  const legalOpen = status.openGates.filter((g) => g.id === "formation");

  return (
    <section className="post-lock-banner font-sans" role="status" aria-live="polite">
      <p className="post-lock-kicker">Founder gates</p>
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
