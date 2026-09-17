"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getOwnerSetupStatus,
  ownerSetupHref,
} from "@/lib/owner-setup-state";
import {
  resolveShopOperateNext,
  type ShopOperateNext,
} from "@/lib/shop-operate";

type AccountPayload = {
  business?: {
    ownerPhone?: string | null;
    twilioPhone?: string | null;
    vapiPhoneNumber?: string | null;
    overflowForwardConfirmedAt?: string | null;
    lineVerifiedAt?: string | null;
    avgTicketCents?: number | null;
    baselineMissedCallsPerWeek?: number | null;
    baselineJobsPerWeek?: number | null;
    lastWeeklyProofAt?: string | null;
  } | null;
};

type Ring1Payload = {
  attention?: Array<{ impact?: string }>;
  health?: {
    failedAlerts24h?: number;
    stuckPendingAlerts?: number;
  };
  outcomes?: {
    economicsReady?: boolean;
    calls?: number;
    leads?: number;
  };
  lastWeeklyProofAt?: string | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Operate O1 for owners — the next shop action sits above Command.
 * Never shows founder multi-b jargon.
 */
export function ShopOperateBanner() {
  const [next, setNext] = useState<ShopOperateNext | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [accountRes, ringRes] = await Promise.all([
          fetch("/api/account"),
          fetch("/api/ring1"),
        ]);
        if (!accountRes.ok) return;
        const account = (await accountRes.json()) as AccountPayload;
        const ring = ringRes.ok ? ((await ringRes.json()) as Ring1Payload) : null;
        if (cancelled || !account.business) return;

        const setup = getOwnerSetupStatus(account.business);
        const attention = ring?.attention ?? [];
        const criticalAttention = attention.filter((i) => i.impact === "critical").length;
        const proofAt =
          ring?.lastWeeklyProofAt ?? account.business.lastWeeklyProofAt ?? null;
        const proofTime = proofAt ? new Date(proofAt).getTime() : 0;
        const nothingToProve =
          (ring?.outcomes?.calls ?? 0) === 0 && (ring?.outcomes?.leads ?? 0) === 0;
        const economicsReady = Boolean(
          account.business.avgTicketCents &&
            account.business.baselineMissedCallsPerWeek != null &&
            account.business.baselineJobsPerWeek != null &&
            (ring?.outcomes?.economicsReady ?? true),
        );
        const proofStale =
          !nothingToProve &&
          economicsReady &&
          (!proofTime || Date.now() - proofTime > WEEK_MS);

        setNext(
          resolveShopOperateNext({
            setupReady: setup.ready,
            setupNext: setup.nextStep,
            setupHref: ownerSetupHref(setup.nextStep),
            failedAlerts: ring?.health?.failedAlerts24h ?? 0,
            stuckAlerts: ring?.health?.stuckPendingAlerts ?? 0,
            criticalAttention,
            attentionCount: attention.length,
            proofStale,
            economicsReady,
          }),
        );
      } catch {
        /* Command still works without the pulse */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !next) return null;

  return (
    <aside
      className={`shop-operate-banner shop-operate-banner--${next.tone} font-sans`}
      role="status"
      aria-label="Next shop action"
    >
      <div className="shop-operate-banner-copy">
        <p className="shop-operate-banner-kicker">Next on the shop</p>
        <p className="shop-operate-banner-title">{next.title}</p>
        <p className="shop-operate-banner-detail">{next.detail}</p>
      </div>
      <Link href={next.href} className="btn btn-void text-sm">
        {next.cta}
      </Link>
    </aside>
  );
}
