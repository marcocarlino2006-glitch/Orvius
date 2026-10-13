"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "@/components/toaster";

type InstantOptions = {
  /** Shown the moment the tap lands, before the server answers. */
  pendingTitle?: string;
  /** Shown when the server confirms. */
  doneTitle: string;
  /** Offered on the confirmation, e.g. Undo. */
  action?: { label: string; run: () => void | Promise<void> };
  /** Reverts optimistic UI when the server says no. */
  revert?: () => void;
};

/**
 * Every tap answers in the same frame it lands: the button shows its working
 * state at once, the screen updates before the server does, and a short buzz
 * confirms it on phones. The server still has the last word — a failure puts
 * the old state back and says what happened, in plain words.
 */
export function useInstantAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const run = useCallback(
    async (work: () => Promise<void>, options: InstantOptions) => {
      const id = ++seq.current;
      setPending(true);
      setError(null);
      if (options.pendingTitle) toast({ title: options.pendingTitle });
      try {
        await work();
        if (seq.current !== id) return;
        setPending(false);
        toast({ title: options.doneTitle, action: options.action });
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(10);
          } catch {
            /* A buzz is a nicety, never a requirement. */
          }
        }
      } catch (err) {
        if (seq.current !== id) return;
        setPending(false);
        options.revert?.();
        const message = err instanceof Error ? err.message : "That didn't go through";
        setError(message);
        toast({ title: message, tone: "error" });
        throw err;
      }
    },
    [],
  );

  return { pending, error, run, clearError: () => setError(null) };
}
