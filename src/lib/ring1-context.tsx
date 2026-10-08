"use client";

import type { Handled } from "@/lib/autopilot";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CoverageState } from "@/lib/coverage-state";
import type { AttentionItem } from "@/lib/attention-types";
import type { CommandCounts } from "@/lib/command-model";
import type { PersonalBrief } from "@/lib/personal-brief";
import type { ShopHealth } from "@/lib/shop-health";
import type { ReceptionistWeek } from "@/lib/receptionist-week";
import type { ShopOutcomes } from "@/lib/shop-outcomes";
import type { ShiftEvent } from "@/lib/shift-timeline";
import type { WedgeReadiness } from "@/lib/wedge-readiness";
import type { BoardItem } from "@/lib/command-board";
import type { ShopIssue, WorkItem } from "@/lib/work";
import type {
  BusinessMetrics,
  BusinessSignals,
  BusinessSnapshot,
} from "@/lib/business-snapshot";

/** The shop's access ended or was never paid: it reads its records, and Command says how to reopen it. */
export type Ring1Lock = {
  reason: "past_due" | "canceled" | "trial_ended" | "unpaid";
  message: string;
};

export type Ring1Data = {
  locked?: Ring1Lock | null;
  business?: {
    name?: string;
    trade?: string | null;
    line?: string | null;
    ownerPhone?: string | null;
    billingStatus?: string | null;
    depositEnabled?: boolean;
    referenceImplementation?: boolean;
    /** Still in setup: settings saved, no line, every text simulated. */
    testMode?: boolean;
  } | null;
  metrics: BusinessMetrics;
  outcomes?: ShopOutcomes;
  receptionist?: ReceptionistWeek;
  commandCounts?: CommandCounts;
  shiftTimeline?: ShiftEvent[];
  attention?: AttentionItem[];
  /** Work waiting on a person, read by the same rules as the Work screen. */
  work?: { needsYou: number; open: number; items: WorkItem[]; approvals: BoardItem[]; shopIssues: ShopIssue[] };
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
  version?: string;
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
  locked: Ring1Lock | null;
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
    trade: data.business.trade ?? null,
    line: data.business.line ?? null,
    ownerPhone: data.business.ownerPhone ?? null,
    sample: Boolean(data.business.referenceImplementation),
    metrics: data.metrics,
    signals: {
      unassignedJobs: data.dispatchToday?.unassigned ?? 0,
      jobsToday: data.dispatchToday?.jobCount ?? 0,
      lineVerified: Boolean(data.health?.lineVerified),
      alertsFailed24h: data.health?.failedAlerts24h ?? 0,
      afterHoursNow: Boolean(data.coverage?.afterHoursNow),
      needsYou: data.work?.needsYou ?? 0,
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
  const version = useRef<string | null>(null);

  /** `ifChanged` lets the server skip the rebuild when nothing moved; a refresh someone asked for never does. */
  const load = useCallback(async (ifChanged: boolean): Promise<"ok" | "no-shop" | "error"> => {
    try {
      const params = new URLSearchParams();
      const since = pinnedSince();
      if (since) params.set("since", since);
      if (ifChanged && version.current) params.set("v", version.current);
      const query = params.toString();
      const res = await fetch(query ? `/api/ring1?${query}` : "/api/ring1");
      /* No shop yet (signed up, not paid): nothing to refresh. Older deploys answer 404 for it. */
      if (res.status === 404) {
        setData(null);
        setLoadError(null);
        return "no-shop";
      }
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Your session expired. Sign in again to refresh Command."
            : "Command could not refresh.",
        );
      }
      const json = (await res.json()) as
        | Ring1Data
        | { unchanged: true; version: string; sinceUsed?: string | null }
        | { noShop: true };
      if ("noShop" in json) {
        setData(null);
        setLoadError(null);
        return "no-shop";
      }
      if (!("unchanged" in json)) setData(json);
      version.current = json.version ?? null;
      pinSince(json.sinceUsed);
      setLoadError(null);
      setLastUpdatedAt(Date.now());
      return "ok";
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
      return "error";
    } finally {
      setLoading(false);
    }
  }, []);
  const refresh = useCallback(() => load(false).then(() => undefined), [load]);

  useEffect(() => {
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let stream: EventSource | null = null;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let lastRun = Date.now();

    const closeStream = () => {
      stream?.close();
      stream = null;
    };
    const stop = () => {
      stopped = true;
      if (interval) clearInterval(interval);
      interval = null;
      if (pending) clearTimeout(pending);
      closeStream();
      document.removeEventListener("visibilitychange", onVisible);
    };
    const tick = () => {
      if (stopped || document.visibilityState !== "visible") return;
      lastRun = Date.now();
      void load(true).then((result) => {
        if (result === "no-shop") stop();
      });
    };

    /* The stream says when something changed; polling stays as the fallback when it can't connect. */
    const openStream = () => {
      if (stopped || stream || typeof EventSource === "undefined") return;
      stream = new EventSource("/api/ring1/stream");
      stream.addEventListener("change", () => {
        if (pending) clearTimeout(pending);
        pending = setTimeout(tick, 400);
      });
    };

    /* A backgrounded tab stops polling; coming back refreshes at once if the data is stale. */
    function onVisible() {
      if (document.visibilityState !== "visible") {
        closeStream();
        return;
      }
      openStream();
      if (Date.now() - lastRun >= AWAY_MS) unpinSince();
      if (refreshMs && Date.now() - lastRun >= refreshMs) tick();
    }

    void load(false).then((result) => {
      if (stopped || result === "no-shop" || !refreshMs) return;
      interval = setInterval(tick, refreshMs);
      openStream();
      document.addEventListener("visibilitychange", onVisible);
    });

    return stop;
  }, [load, refreshMs]);

  const value = useMemo<Ring1ContextValue>(
    () => ({
      data,
      locked: data?.locked ?? null,
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
