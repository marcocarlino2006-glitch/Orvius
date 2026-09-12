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
 * Founder-only post-lock instrument.
 * Hidden from shop owners. Compact on Settings, full on Billing.
 */
export function PostLockBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [isFounder, setIsFounder] = useState(false);

  const onBilling = pathname?.startsWith("/dashboard/billing");
  const onSettings = pathname?.startsWith("/dashboard/settings");
  const show = onBilling || onSettings;

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    fetch("/api/account")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setIsFounder(Boolean(data?.viewer?.isFounder));
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [show]);

  useEffect(() => {
    if (!show || !isFounder) return;
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
  }, [show, isFounder]);

  if (!show || !isFounder || !status || status.fullyReady) return null;

  if (onSettings) {
    return (
      <p className="post-lock-strip font-sans" role="status">
        <span className="post-lock-strip-label">Founder gates</span>
        <span className="post-lock-strip-copy">
          {status.openGates.length} open · {status.message}
        </span>
        <Link href="/dashboard/billing" className="post-lock-strip-link">
          Unblock
        </Link>
      </p>
    );
  }

  return (
    <section className="post-lock-banner font-sans" role="status" aria-live="polite">
      <p className="post-lock-kicker">Founder gates</p>
      <p className="post-lock-message">{status.message}</p>
      <ul className="post-lock-gates">
        {status.openGates.map((gate) => (
          <li key={gate.id}>
            <strong>{gate.label}</strong>
            <span>{gate.detail}</span>
          </li>
        ))}
      </ul>
      <div className="post-lock-actions">
        {!status.checkoutPublicReady ? (
          <span className="post-lock-hint">
            Finish Stripe keys before claiming paid checkout.
          </span>
        ) : (
          <span className="post-lock-hint">
            Checkout ready — formation still blocks legal claims.
          </span>
        )}
      </div>
    </section>
  );
}
