"use client";

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
import type { ShopHealth } from "@/lib/shop-health";
import type { ShopOutcomes } from "@/lib/shop-outcomes";
import type { ShiftEvent } from "@/lib/shift-timeline";
import type { WedgeReadiness } from "@/lib/wedge-readiness";
import type { CommandToday } from "@/lib/command-today";
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
  today?: CommandToday;
  workflow?: { alertsProven?: boolean };
  outcomes?: ShopOutcomes;
  shiftTimeline?: ShiftEvent[];
  attention?: AttentionItem[];
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
  refresh: () => Promise<void>;
  business: BusinessSnapshot | null;
};

const Ring1Context = createContext<Ring1ContextValue | null>(null);

const DEFAULT_REFRESH_MS = 30_000;

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
 * OsShell, operate banner, and Command center share this pulse.
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

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ring1");
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Your session expired. Sign in again to refresh Command."
            : "Command could not refresh.",
        );
      }
      const json = (await res.json()) as Ring1Data;
      setData(json);
      setLoadError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Command could not refresh.";
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
    const interval = setInterval(() => {
      void refresh();
    }, refreshMs);
    return () => clearInterval(interval);
  }, [refresh, refreshMs]);

  const value = useMemo<Ring1ContextValue>(
    () => ({
      data,
      loading,
      loadError,
      refresh,
      business: toBusiness(data),
    }),
    [data, loading, loadError, refresh],
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
