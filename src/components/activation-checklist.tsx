"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ActivationItem } from "@/lib/activation";

const WAIT_LABEL: Record<NonNullable<ActivationItem["waitingOn"]>, string> = { owner: "Your move", provider: "Waiting on provider", proof: "Not verified yet" };

function stateLabel(item: ActivationItem) {
  if (item.state === "live") return "Ready";
  if (item.waitingOn) return WAIT_LABEL[item.waitingOn];
  return item.state === "off" ? "Off" : "To do";
}

/** What is on after go-live. Each row is proven by a real event, never by a saved setting. */
export function ActivationChecklist({ onlyLeft = false }: { onlyLeft?: boolean }) {
  const [items, setItems] = useState<ActivationItem[] | null>(null);
  const [headline, setHeadline] = useState("");
  const [next, setNext] = useState<ActivationItem | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [alertNote, setAlertNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/live-check", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as { items: ActivationItem[]; summary: { headline: string; next?: ActivationItem | null } };
      setItems(json.items);
      setHeadline(json.summary.headline);
      setNext(json.summary.next ?? null);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function sendTestAlert() {
    setSending(true);
    setAlertNote(null);
    try {
      const res = await fetch("/api/account/test-alert", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) setAlertNote({ ok: false, text: json.error ?? "The test alert didn't send. Try again." });
      else if (json.ok) setAlertNote({ ok: true, text: "Sent. Check your phone; this list updates when the carrier confirms delivery." });
      else setAlertNote({ ok: false, text: "It didn't go through. Check your mobile number in Settings, then try again." });
      void load();
    } catch {
      setAlertNote({ ok: false, text: "Network error. Check your connection and try again." });
    } finally {
      setSending(false);
    }
  }

  if (loadError && !items) {
    if (onlyLeft) return null;
    return (
      <div className="activation">
        <p className="onboarding-error font-sans">We couldn&apos;t load what&apos;s on right now.</p>
        <button type="button" className="onboarding-verify-link font-sans" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }
  if (!items) return onlyLeft ? null : <p className="onboarding-lead font-sans" aria-busy="true">Checking what&apos;s on…</p>;
  const shown = onlyLeft ? items.filter((i) => i.state !== "live") : items;
  if (onlyLeft && !shown.length) return null;

  return (
    <section className="activation font-sans" aria-label="What's live">
      <p className="activation-headline">{headline}</p>
      {next ? (
        <p className="activation-next" role="status">
          <strong>Next: {next.label}.</strong> {next.detail}
        </p>
      ) : items.some((i) => i.state !== "live") ? (
        <p className="activation-next" role="status">
          Nothing is waiting on you. The rest is with a provider or waiting for real calls and jobs to prove it.
        </p>
      ) : null}
      <ul className="activation-list">
        {shown.map((item) => (
          <li key={item.id} className={`activation-item is-${item.state}${item.waitingOn ? ` is-wait-${item.waitingOn}` : ""}`}>
            <span className="activation-state">{stateLabel(item)}</span>
            <div className="activation-body">
              <p className="activation-label">{item.label}</p>
              <p className="activation-detail">{item.detail}</p>
              {item.id === "alerts" && alertNote ? (
                <p className={alertNote.ok ? "activation-ok" : "onboarding-error"} role="status">
                  {alertNote.text}
                </p>
              ) : null}
            </div>
            {item.action ? (
              item.action.kind === "test_alert" ? (
                <button type="button" className="btn btn-secondary text-sm" disabled={sending} onClick={() => void sendTestAlert()}>
                  {sending ? "Sending…" : item.action.label}
                </button>
              ) : (
                <Link href={item.action.href} className="btn btn-secondary text-sm">
                  {item.action.label}
                </Link>
              )
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
