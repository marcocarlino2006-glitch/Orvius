"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getOwnerSetupStatus,
  ownerSetupHref,
} from "@/lib/owner-setup-state";
import {
  resolveShopOperateNext,
  type ShopOperateNext,
} from "@/lib/shop-operate";
import { copyWeeklyProofRitual } from "@/lib/weekly-proof-client";

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
 * Rituals that can finish in one tap (proof, test alert) run in place.
 */
export function ShopOperateBanner() {
  const [next, setNext] = useState<ShopOperateNext | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [accountRes, ringRes] = await Promise.all([
      fetch("/api/account"),
      fetch("/api/ring1"),
    ]);
    if (!accountRes.ok) return;
    const account = (await accountRes.json()) as AccountPayload;
    const ring = ringRes.ok ? ((await ringRes.json()) as Ring1Payload) : null;
    if (!account.business) {
      setNext(null);
      return;
    }

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
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch {
        /* Command still works without the pulse */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function runInline() {
    if (!next || busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (next.id === "weekly-proof") {
        await copyWeeklyProofRitual();
        setNote("Proof copied — paste into notes / Slack");
        await refresh();
        return;
      }
      if (next.id === "alerts") {
        const res = await fetch("/api/account/test-alert", { method: "POST" });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          ok?: boolean;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error ?? "Could not send test alert");
        }
        if (!data?.ok) {
          throw new Error(
            data?.error ??
              "Alert queued but not delivered. Check Settings.",
          );
        }
        setNote("Test alert sent — check your phone");
        await refresh();
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not finish that step");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded || !next) return null;

  const inline = next.id === "weekly-proof" || next.id === "alerts";

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
        {note ? <p className="shop-operate-banner-note">{note}</p> : null}
      </div>
      {inline ? (
        <button
          type="button"
          className="btn btn-void text-sm"
          disabled={busy}
          onClick={() => void runInline()}
        >
          {busy
            ? "Working…"
            : next.id === "weekly-proof"
              ? "Copy proof"
              : "Send test alert"}
        </button>
      ) : (
        <Link href={next.href} className="btn btn-void text-sm">
          {next.cta}
        </Link>
      )}
    </aside>
  );
}
