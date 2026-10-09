"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  Technicians work in basements, crawlspaces and rural driveways. What they
  last opened stays readable on the phone (always labelled with when it was
  saved), and the field updates that don't need an answer right away (notes,
  checklist ticks, the customer's sign-off, status) wait on the phone and send
  in order when signal comes back. Prices, photos and payments need the server
  and say so instead of pretending.
*/

const CACHE_PREFIX = "ta:get:";
const OUTBOX = "ta:outbox";
const FAILED = "ta:failed";
const MAX_CACHED = 40;
const CHANGED = "ta-outbox";

export type Queued = { id: string; url: string; method: string; body: string; label: string; at: string };
export type FailedSend = { id: string; label: string; error: string; at: string };

export const NO_SIGNAL = "No signal right now. This one needs a connection, so try again when you have bars.";

class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    pruneCache(0);
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or disabled: the app still works online */
    }
  }
  if (key === OUTBOX || key === FAILED) window.dispatchEvent(new Event(CHANGED));
}

function pruneCache(keep: number) {
  const entries: Array<{ key: string; at: string }> = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) entries.push({ key, at: read<{ at?: string }>(key, {}).at ?? "" });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));
  for (const e of entries.slice(keep)) window.localStorage.removeItem(e.key);
}

/** A link that was turned off takes everything it saved on this phone with it. */
export function forgetEverything() {
  pruneCache(0);
  window.localStorage.removeItem(OUTBOX);
  window.localStorage.removeItem(FAILED);
  window.dispatchEvent(new Event(CHANGED));
  if ("caches" in window) void caches.keys().then((keys) => keys.filter((k) => k.startsWith("orvius-tech-")).forEach((k) => void caches.delete(k)));
}

async function json(res: Response) {
  return (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
}

/** Fresh from the server when there's signal; otherwise the copy saved on this phone and when it was saved. */
export async function cachedGet<T>(url: string): Promise<{ data: T; savedAt: string | null }> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    const hit = read<{ at: string; data: T } | null>(CACHE_PREFIX + url, null);
    if (hit) return { data: hit.data, savedAt: hit.at };
    throw new Error("No signal, and this hasn't been opened on this phone yet. It will load when you have bars.");
  }
  const data = await json(res);
  if (!res.ok) {
    if (res.status === 404) window.localStorage.removeItem(CACHE_PREFIX + url);
    throw new HttpError(data.error ?? "Something went wrong. Try again.", res.status);
  }
  write(CACHE_PREFIX + url, { at: new Date().toISOString(), data });
  pruneCache(MAX_CACHED);
  return { data: data as T, savedAt: null };
}

/** Keep the phone's copy in step with what the server just confirmed. */
export function rememberGet(url: string, data: unknown) {
  write(CACHE_PREFIX + url, { at: new Date().toISOString(), data });
}

export function isGone(error: unknown) {
  return error instanceof HttpError && error.status === 404;
}

export function outbox(): Queued[] {
  return read<Queued[]>(OUTBOX, []);
}

function enqueue(item: Omit<Queued, "id" | "at">) {
  write(OUTBOX, [...outbox(), { ...item, id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, at: new Date().toISOString() }]);
}

/**
 * Send now, or keep it on the phone if there's no signal. Anything already
 * waiting goes first, so the office sees "arrived" before "finished".
 */
export async function sendOrQueue<T>(url: string, method: string, payload: object, label: string): Promise<{ queued: true } | { queued: false; data: T }> {
  const body = JSON.stringify(payload);
  if (outbox().length) {
    enqueue({ url, method, body, label });
    void flushOutbox();
    return { queued: true };
  }
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body });
  } catch {
    enqueue({ url, method, body, label });
    return { queued: true };
  }
  const data = await json(res);
  if (!res.ok) throw new Error(data.error ?? "That didn't save. Try again.");
  return { queued: false, data: data as T };
}

let flushing: Promise<number> | null = null;

/** Send what's waiting, oldest first. Stops at the first sign there's still no signal. */
export function flushOutbox(): Promise<number> {
  flushing ??= (async () => {
    let sent = 0;
    try {
      for (;;) {
        const [next] = outbox();
        if (!next) break;
        let res: Response;
        try {
          res = await fetch(next.url, { method: next.method, headers: { "Content-Type": "application/json" }, body: next.body });
        } catch {
          break;
        }
        if (res.status === 429 || res.status >= 500) break;
        if (!res.ok) {
          const data = await json(res);
          write(FAILED, [...read<FailedSend[]>(FAILED, []), { id: next.id, label: next.label, error: data.error ?? "It was turned down.", at: new Date().toISOString() }].slice(-10));
        } else {
          sent += 1;
        }
        write(OUTBOX, outbox().filter((q) => q.id !== next.id));
      }
    } finally {
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}

/** Signal state and what's waiting; reloads the screen after waiting changes go through. */
export function useFieldSync(onSent: () => void) {
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState<Queued[]>([]);
  const [failed, setFailed] = useState<FailedSend[]>([]);
  const sentRef = useRef(onSent);
  sentRef.current = onSent;

  const refresh = useCallback(() => {
    setQueued(outbox());
    setFailed(read<FailedSend[]>(FAILED, []));
  }, []);

  const flush = useCallback(async () => {
    if (!outbox().length) return;
    const sent = await flushOutbox();
    refresh();
    if (sent) sentRef.current();
  }, [refresh]);

  useEffect(() => {
    refresh();
    setOnline(navigator.onLine);
    void flush();
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    const onStorage = (e: StorageEvent) => {
      if (e.key === OUTBOX || e.key === FAILED) refresh();
    };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener(CHANGED, refresh);
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(() => void flush(), 20_000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.removeEventListener(CHANGED, refresh);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, [flush, refresh]);

  const dismissFailed = useCallback(() => write(FAILED, []), []);
  return { online, queued, failed, dismissFailed, flush };
}

/** Keeps the app's pages and scripts on the phone so it opens without signal. */
export function useTechShell() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/tech-sw.js", { scope: "/tech/" }).catch(() => undefined);
  }, []);
}
