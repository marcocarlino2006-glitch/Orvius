/**
 * Screens paint what they showed last time, then refresh. Opening Jobs a
 * second time should not be a skeleton and a wait.
 *
 * Memory only, per tab: a sign-out or a shop switch is a full page load, so
 * one shop's data can never paint for another. Old entries are not shown.
 */
const FRESH_FOR_MS = 10 * 60_000;
const MAX_ENTRIES = 40;
const PREFETCH_GAP_MS = 15_000;

type Entry = { data: unknown; at: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/* A server render shares this module across every request, so it never reads or writes. */
const onServer = () => typeof window === "undefined";

export function cachedScreen<T>(url: string, now = Date.now()): T | null {
  if (onServer()) return null;
  const entry = store.get(url);
  if (!entry) return null;
  if (now - entry.at > FRESH_FOR_MS) {
    store.delete(url);
    return null;
  }
  return entry.data as T;
}

export function rememberScreen(url: string, data: unknown, now = Date.now()) {
  if (onServer()) return;
  store.delete(url);
  store.set(url, { data, at: now });
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
}

export function forgetScreens() {
  store.clear();
  inflight.clear();
}

/** Fetch a screen's data and remember it. A failed reply is never remembered. */
export async function loadScreen<T>(url: string, init?: RequestInit): Promise<{ res: Response; data: T | null }> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) return { res, data: null };
  const data = (await res.json()) as T;
  rememberScreen(url, data);
  return { res, data };
}

/** Warm a screen before it is opened (hover, focus). Repeats inside 15s do nothing. */
export function prefetchScreen(url: string) {
  if (onServer()) return;
  const entry = store.get(url);
  if ((entry && Date.now() - entry.at < PREFETCH_GAP_MS) || inflight.has(url)) return;
  const run = loadScreen(url)
    .catch(() => null)
    .finally(() => inflight.delete(url));
  inflight.set(url, run);
}

/** What each place loads first, so hovering it in the sidebar warms it. */
export const SCREEN_DATA: Record<string, string[]> = {
  "/dashboard/jobs": ["/api/jobs", "/api/leads?limit=1"],
  "/dashboard/calls": ["/api/calls?limit=100"],
  "/dashboard/inbox": ["/api/leads?view="],
  "/dashboard/work": ["/api/work?view=open"],
};

export function prefetchPlace(href: string) {
  for (const url of SCREEN_DATA[href] ?? []) prefetchScreen(url);
}
