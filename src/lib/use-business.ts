"use client";

import { useRing1 } from "@/lib/ring1-context";

export type {
  BusinessMetrics,
  BusinessSignals,
  BusinessSnapshot,
} from "@/lib/business-snapshot";

/**
 * Shop snapshot for shell chrome — derived from the shared Ring1 pulse.
 * refreshMs is accepted for call-site compatibility; the provider owns the interval.
 */
export function useBusiness(_refreshMs?: number) {
  const { business, loading, refresh } = useRing1();
  return { business, loading, refresh };
}
