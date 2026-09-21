"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useOptionalRing1,
  type Ring1Data,
} from "@/lib/ring1-context";
import type {
  BusinessMetrics,
  BusinessSignals,
  BusinessSnapshot,
} from "@/lib/business-snapshot";

export type {
  BusinessMetrics,
  BusinessSignals,
  BusinessSnapshot,
} from "@/lib/business-snapshot";

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
 * Shop snapshot for shell chrome.
 * Inside the dashboard Ring1Provider — shared pulse.
 * Outside (admin, domains) — own fetch so OsShell never crashes prerender.
 */
export function useBusiness(_refreshMs?: number) {
  const ring = useOptionalRing1();
  const [business, setBusiness] = useState<BusinessSnapshot | null>(null);
  const [loading, setLoading] = useState(!ring);
  const [tick, setTick] = useState(0);

  const refreshFallback = useCallback(async () => {
    try {
      const res = await fetch("/api/ring1");
      if (!res.ok) {
        setBusiness(null);
        return;
      }
      const json = (await res.json()) as Ring1Data;
      setBusiness(toBusiness(json));
    } catch {
      setBusiness(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ring) return;
    void refreshFallback();
  }, [ring, refreshFallback, tick]);

  if (ring) {
    return {
      business: ring.business,
      loading: ring.loading,
      refresh: ring.refresh,
    };
  }

  return {
    business,
    loading,
    refresh: async () => {
      setLoading(true);
      setTick((n) => n + 1);
      await refreshFallback();
    },
  };
}
