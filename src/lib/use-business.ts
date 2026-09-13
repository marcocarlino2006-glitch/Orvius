"use client";

import { useCallback, useEffect, useState } from "react";

export type BusinessMetrics = {
  callsToday: number;
  leadsToday: number;
  newLeads: number;
  totalCalls: number;
  totalLeads: number;
  leadBookingRate: number | null;
  lastCallAt: string | null;
  lastCaller: string | null;
};

/** Counts the shell shows on the rail so an owner never has to open a screen to look. */
export type BusinessSignals = {
  unassignedJobs: number;
  jobsToday: number;
  lineVerified: boolean;
  alertsFailed24h: number;
  /*
    Whether the clock is currently outside the shop's own configured hours —
    decided on the server against hoursJson and the shop's timezone, because a
    shop that answers until eight should not be told it is after hours at six.
  */
  afterHoursNow: boolean;
};

export type BusinessSnapshot = {
  name: string;
  line: string | null;
  ownerPhone: string | null;
  metrics: BusinessMetrics;
  signals: BusinessSignals;
};

type Ring1Response = {
  business: {
    name: string;
    line: string | null;
    ownerPhone: string | null;
  } | null;
  metrics: BusinessMetrics;
  dispatchToday?: { jobCount: number; unassigned: number };
  health?: { lineVerified: boolean; failedAlerts24h: number };
  coverage?: { afterHoursNow: boolean };
};

export function useBusiness(refreshMs?: number) {
  const [business, setBusiness] = useState<BusinessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ring1");
      if (!res.ok) return;
      const json = (await res.json()) as Ring1Response;
      if (json.business) {
        setBusiness({
          name: json.business.name,
          line: json.business.line,
          ownerPhone: json.business.ownerPhone,
          metrics: json.metrics,
          signals: {
            unassignedJobs: json.dispatchToday?.unassigned ?? 0,
            jobsToday: json.dispatchToday?.jobCount ?? 0,
            lineVerified: Boolean(json.health?.lineVerified),
            alertsFailed24h: json.health?.failedAlerts24h ?? 0,
            afterHoursNow: Boolean(json.coverage?.afterHoursNow),
          },
        });
      }
    } catch {
      /* keep last good snapshot */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!refreshMs) return;
    const interval = setInterval(refresh, refreshMs);
    return () => clearInterval(interval);
  }, [refresh, refreshMs]);

  return { business, loading, refresh };
}
