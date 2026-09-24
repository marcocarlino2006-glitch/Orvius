"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  FIRST_NIGHT_PARAM,
  FIRST_NIGHT_STORAGE_KEY,
} from "@/components/first-night-handoff";
import {
  getOwnerSetupStatus,
  ownerSetupHref,
} from "@/lib/owner-setup-state";
import { useRing1 } from "@/lib/ring1-context";
import {
  resolveShopOperateNext,
  shopOperateBannerVisible,
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Operate O1 — the single next shop action above Command.
 * Hidden when the board already owns the work, or when covered (Ask still gets a next).
 * Clears first-night pending silently — no click gate before the pulse.
 */
export function ShopOperateBanner() {
  const searchParams = useSearchParams();
  const { data: ring, refresh: refreshRing } = useRing1();
  const [next, setNext] = useState<ShopOperateNext | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const fromQuery = searchParams.get(FIRST_NIGHT_PARAM) === "1";
    try {
      if (fromQuery || sessionStorage.getItem(FIRST_NIGHT_STORAGE_KEY) === "1") {
        sessionStorage.removeItem(FIRST_NIGHT_STORAGE_KEY);
      }
    } catch {
      /* private mode */
    }
    if (fromQuery) {
      const url = new URL(window.location.href);
      url.searchParams.delete(FIRST_NIGHT_PARAM);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [searchParams]);

  const refresh = useCallback(async () => {
    const accountRes = await fetch("/api/account");
    if (!accountRes.ok) return;
    const account = (await accountRes.json()) as AccountPayload;
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
  }, [ring]);

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
        setNote("Proof copied — paste into your notes");
        await refreshRing();
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
        await refreshRing();
        await refresh();
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not finish that step");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded || !next || !shopOperateBannerVisible(next)) return null;
  // The work queue already carries alert failures as one incident.
  if (next.id === "alerts" && (ring?.attention ?? []).some((i) => i.kind === "alert_failed")) {
    return null;
  }

  const inline = next.id === "weekly-proof" || next.id === "alerts";

  return (
    <aside
      className={`shop-operate-banner shop-operate-banner--${next.tone} font-sans`}
      role="status"
      aria-label="Next shop action"
    >
      <div className="shop-operate-banner-copy">
        <p className="shop-operate-banner-kicker">Next</p>
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
