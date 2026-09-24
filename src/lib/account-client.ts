"use client";

/**
 * The shell's sidebar, banner, pay prompt, and plan gate all read
 * /api/account on mount. One request per page load serves them all; a short
 * window keeps a just-saved setting from reading stale for long.
 */
const FRESH_MS = 5_000;
let inflight: { at: number; promise: Promise<Response> } | null = null;

export function fetchAccount(): Promise<Response> {
  if (!inflight || Date.now() - inflight.at > FRESH_MS) {
    const promise = fetch("/api/account");
    inflight = { at: Date.now(), promise };
    promise.then((res) => {
      if (!res.ok) inflight = null;
    }, () => {
      inflight = null;
    });
  }
  return inflight.promise.then((res) => res.clone());
}

export function invalidateAccount() {
  inflight = null;
}
