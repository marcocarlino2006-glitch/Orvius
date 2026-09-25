"use client";

import type { Handled } from "@/lib/autopilot";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CoverageState } from "@/lib/coverage-state";
import type { AttentionItem } from "@/lib/attention-types";
import type { CommandCounts } from "@/lib/command-model";
import type { PersonalBrief } from "@/lib/personal-brief";
import type { ShopHealth } from "@/lib/shop-health";
import type { ShopOutcomes } from "@/lib/shop-outcomes";
import type { ShiftEvent } from "@/lib/shift-timeline";
import type { WedgeReadiness } from "@/lib/wedge-readiness";
import type {
  BusinessMetrics,
  BusinessSignals,
  BusinessSnapshot,
} from "@/lib/business-snapshot";

export type Ring1Data = {
  business?: {
    name?: string;
    line?: string | null;
    ownerPhone?: string | null;
    billingStatus?: string | null;
    depositEnabled?: boolean;
    referenceImplementation?: boolean;
  } | null;
  metrics: BusinessMetrics;
  outcomes?: ShopOutcomes;
  commandCounts?: CommandCounts;
  shiftTimeline?: ShiftEvent[];
  attention?: AttentionItem[];
  /** What Orvius did on its own in the last 24 hours. */
  handled?: Handled;
  dispatchToday?: {
    jobCount: number;
    unassigned: number;
    jobs: Array<{
      id: string;
      title: string;
      status: string;
      scheduledAt: string | null;
      address: string | null;
      urgency: string | null;
      technicianId?: string | null;
      technician?: { name: string } | null;
      customer?: { name: string | null; phone: string } | null;
      lead?: { name: string | null; phone: string | null } | null;
    }>;
  };
  technicians?: Array<{ id: string; name: string }>;
  health?: ShopHealth;
  wedge?: WedgeReadiness;
  coverage?: CoverageState;
  lastWeeklyProofAt?: string | null;
  personalBrief?: PersonalBrief | null;
  sinceUsed?: string | null;
  gates?: {
    certDone: number;
    certTotal: number;
    certIncomplete: boolean;
    economicsReady: boolean;
    proofStale: boolean;
    pilotDaysLeft: number;
    checkoutReady: boolean;
  };
};

type Ring1ContextValue = {
  data: Ring1Data | null;
  loading: boolean;
  loadError: string | null;
  /** Epoch ms of the last successful refresh — drives the freshness readout. */
  lastUpdatedAt: number | null;
  refresh: () => Promise<void>;
  business: BusinessSnapshot | null;
};

const Ring1Context = createContext<Ring1ContextValue | null>(null);

const DEFAULT_REFRESH_MS = 30_000;
const SESSION_SINCE_KEY = "orvius.command.since";
const AWAY_MS = 30 * 60_000;

/**
 * "Since you last looked" is anchored on the account, so the phone and the
 * laptop agree. The first load of a tab pins the anchor the server used, so
 * reloads and polling don't reset it to thirty seconds ago.
 */
function pinnedSince(): string | null {
  try {
    const pinned = sessionStorage.getItem(SESSION_SINCE_KEY);
    // "" means this tab started with no previous look; keep it that way rather than fall back.
    return pinned === null ? null : pinned || "none";
  } catch {
    return null;
  }
}

function pinSince(value: string | null | undefined) {
  try {
    if (sessionStorage.getItem(SESSION_SINCE_KEY) === null) sessionStorage.setItem(SESSION_SINCE_KEY, value ?? "");
  } catch {
    /* storage unavailable: each load uses the account anchor */
  }
}

/** Coming back to a tab left in the background for a while counts as a new look. */
function unpinSince() {
  try {
    sessionStorage.removeItem(SESSION_SINCE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function toBusiness(data: Ring1Data | null): BusinessSnapshot | null {
  if (!data?.business?.name) return null;
  return {
    name: data.business.name,
    line: data.business.line ?? null,
    ownerPhone: data.business.ownerPhone ?? null,
    metrics: data.metrics,
    signals: {
      unassignedJobs: data.dispatchToday?.unassigned ?? 0,
      jobsToday: data.dispatchToday?.jobCount ?? 0,
      lineVerified: Boolean(data.health?.lineVerified),
      alertsFailed24h: data.health?.failedAlerts24h ?? 0,
      afterHoursNow: Boolean(data.coverage?.afterHoursNow),
    } satisfies BusinessSignals,
  };
}

/**
 * One Command fetch for the whole dashboard shell.
 * OsShell, operate banner, and Command pulse share this pulse.
 */
export function Ring1Provider({
  children,
  refreshMs = DEFAULT_REFRESH_MS,
}: {
  children: ReactNode;
  refreshMs?: number;
}) {
  const [data, setData] = useState<Ring1Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const since = pinnedSince();
      const res = await fetch(since ? `/api/ring1?since=${encodeURIComponent(since)}` : "/api/ring1");
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Your session expired. Sign in again to refresh Command."
            : "Command could not refresh.",
        );
      }
      const json = (await res.json()) as Ring1Data;
      setData(json);
      pinSince(json.sinceUsed);
      setLoadError(null);
      setLastUpdatedAt(Date.now());
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Orvius can't reach the network right now."
          : err instanceof Error
            ? err.message
            : "Command could not refresh.";
      setData((current) => {
        setLoadError(
          current
            ? "Live refresh is temporarily unavailable. Existing information remains visible."
            : message,
        );
        return current;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!refreshMs) return;
    let lastRun = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      lastRun = Date.now();
      void refresh();
    };
    const interval = setInterval(tick, refreshMs);

    /* The stream says when something changed; polling stays as the fallback when it can't connect. */
    let stream: EventSource | null = null;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const openStream = () => {
      if (stream || typeof EventSource === "undefined") return;
      stream = new EventSource("/api/ring1/stream");
      stream.addEventListener("change", () => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(tick, 400);
      });
    };
    const closeStream = () => {
      stream?.close();
      stream = null;
    };
    openStream();

    /* A backgrounded tab stops polling; coming back refreshes at once if the data is stale. */
    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        closeStream();
        return;
      }
      openStream();
      if (Date.now() - lastRun >= AWAY_MS) unpinSince();
      if (Date.now() - lastRun >= refreshMs) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      if (pending) clearTimeout(pending);
      closeStream();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, refreshMs]);

  const value = useMemo<Ring1ContextValue>(
    () => ({
      data,
      loading,
      loadError,
      lastUpdatedAt,
      refresh,
      business: toBusiness(data),
    }),
    [data, loading, loadError, lastUpdatedAt, refresh],
  );

  return (
    <Ring1Context.Provider value={value}>{children}</Ring1Context.Provider>
  );
}

export function useOptionalRing1() {
  return useContext(Ring1Context);
}

export function useRing1() {
  const ctx = useOptionalRing1();
  if (!ctx) {
    throw new Error("useRing1 must be used inside Ring1Provider");
  }
  return ctx;
}
