"use client";

import { useEffect, useState } from "react";

export type ToastInput = {
  title: string;
  tone?: "done" | "error";
  /** Offered for a few seconds; the toast closes when it is clicked. */
  action?: { label: string; run: () => void | Promise<void> };
};

type Toast = ToastInput & { id: number };

const TOAST_EVENT = "orvius:toast";
let nextId = 1;

/** Confirm an action from anywhere in the app. A no-op where no Toaster is mounted. */
export function toast(input: ToastInput) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Toast>(TOAST_EVENT, { detail: { ...input, id: nextId++ } }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const timers = new Map<number, number>();
    const dismiss = (id: number) => {
      setToasts((list) => list.filter((t) => t.id !== id));
      window.clearTimeout(timers.get(id));
      timers.delete(id);
    };
    const onToast = (event: Event) => {
      const next = (event as CustomEvent<Toast>).detail;
      setToasts((list) => [...list.slice(-2), next]);
      timers.set(next.id, window.setTimeout(() => dismiss(next.id), next.action ? 6000 : 3500));
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const close = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));

  return (
    <div className="os-toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`os-toast font-sans${t.tone === "error" ? " os-toast--error" : ""}`}>
          <span className="os-toast-dot" aria-hidden />
          <span className="os-toast-title">{t.title}</span>
          {t.action ? (
            <button
              type="button"
              className="os-toast-action"
              onClick={() => {
                close(t.id);
                void t.action?.run();
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button type="button" className="os-toast-close" aria-label="Dismiss" onClick={() => close(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
