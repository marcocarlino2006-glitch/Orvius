"use client";

import { useCallback, useEffect, useState } from "react";

export type BusinessMetrics = {
  callsToday: number;
  leadsToday: number;
  newLeads: number;
  totalCalls: number;
  totalLeads: number;
  answerRate: number | null;
  lastCallAt: string | null;
  lastCaller: string | null;
};

export type BusinessSnapshot = {
  name: string;
  line: string | null;
  ownerPhone: string | null;
  metrics: BusinessMetrics;
};

type Ring1Response = {
  business: {
    name: string;
    line: string | null;
    ownerPhone: string | null;
  } | null;
  metrics: BusinessMetrics;
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
