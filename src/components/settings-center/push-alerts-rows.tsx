"use client";

import { useCallback, useEffect, useState } from "react";
import { ScRow, ScStatus, ScSwitch } from "@/components/settings-center/settings-primitives";

type State =
  | { kind: "loading" }
  | { kind: "unsupported"; reason: string }
  | { kind: "unconfigured" }
  | { kind: "ready"; publicKey: string; on: boolean; blocked: boolean };

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIosBrowserTab() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone;
}

/** Push alerts for this device. Texts still go out; this is the faster tap on the shoulder. */
export function PushAlertsRows() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState({
        kind: "unsupported",
        reason: isIosBrowserTab()
          ? "On iPhone, tap Share → Add to Home Screen, open Orvius from there, then turn this on."
          : "This browser can't receive push alerts.",
      });
      return;
    }
    const res = await fetch("/api/push").catch(() => null);
    const json = res?.ok ? ((await res.json()) as { publicKey: string | null }) : null;
    if (!json?.publicKey) {
      setState({ kind: "unconfigured" });
      return;
    }
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    setState({
      kind: "ready",
      publicKey: json.publicKey,
      on: Boolean(subscription),
      blocked: Notification.permission === "denied",
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(next: boolean) {
    if (state.kind !== "ready") return;
    setBusy(true);
    setNote(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      if (next) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setNote("Notifications are blocked for Orvius in this browser's settings.");
          return;
        }
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(state.publicKey),
          }));
        const res = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
        if (!res.ok) throw new Error("save failed");
      } else {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await fetch("/api/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          await subscription.unsubscribe();
        }
      }
      await load();
    } catch {
      setNote("Couldn't change push alerts on this device. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    }).catch(() => null);
    const json = res?.ok ? ((await res.json()) as { delivered: number }) : null;
    setNote(json?.delivered ? "Sent — check this device." : "No device received it. Turn push off and on again.");
    setBusy(false);
  }

  const hint =
    state.kind === "unsupported"
      ? state.reason
      : state.kind === "unconfigured"
        ? "Switches on from our side. Nothing to set up."
        : state.kind === "ready" && state.blocked
          ? "Notifications are blocked for Orvius in this browser's settings."
          : "New calls and urgent jobs on this phone or computer, as they happen. Texts still go out.";

  return (
    <>
      <ScRow label="Push alerts on this device" hint={note ?? hint}>
        {state.kind === "ready" ? (
          <ScSwitch
            label="Push alerts on this device"
            checked={state.on}
            disabled={busy || state.blocked}
            onChange={(next) => void toggle(next)}
          />
        ) : state.kind === "loading" ? null : (
          <ScStatus on={false}>Off</ScStatus>
        )}
      </ScRow>
      {state.kind === "ready" && state.on ? (
        <ScRow label="Send a test push" hint="Shows up on every device you turned push on for.">
          <button type="button" className="sc-btn" disabled={busy} onClick={() => void sendTest()}>
            Send test
          </button>
        </ScRow>
      ) : null}
    </>
  );
}
