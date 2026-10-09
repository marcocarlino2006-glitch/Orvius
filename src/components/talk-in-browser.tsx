"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SIGNUP_HREF } from "@/lib/signup-href";

const MAX_SECONDS = 180;
const POLL_MS = 3000;

type Line = { role: "assistant" | "user"; text: string };
type View =
  | { state: "checking" }
  | { state: "hidden" }
  | { state: "idle" }
  | { state: "joining" }
  | { state: "waiting"; ticketId: string; position: number; talkingNow: number; waitSeconds: number }
  | { state: "ready"; ticketId: string }
  | { state: "connecting"; ticketId: string }
  | { state: "live"; ticketId: string; startedAt: number }
  | { state: "done" }
  | { state: "closed"; reason: "daily" | "limit" | "off" }
  | { state: "error"; message: string };

type ServerView =
  | { state: "open" }
  | { state: "waiting"; ticketId: string; position: number; talkingNow: number; waitSeconds: number }
  | { state: "ready" | "live" | "done"; ticketId: string }
  | { state: "closed"; reason: "daily" | "limit" | "off" };

type VapiClient = {
  on: (event: string, fn: (payload?: unknown) => void) => void;
  reconnect: (call: unknown) => Promise<void>;
  stop: () => Promise<void>;
  setMuted: (mute: boolean) => void;
};

const CLOSED_COPY: Record<"daily" | "limit" | "off", string> = {
  daily: "Today's browser demo calls are used up. Call the live line or watch a real call instead.",
  limit: "You've tried it a few times this hour. Call the live line or come back later.",
  off: "The browser demo isn't open right now.",
};

const minutes = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec % 60)).padStart(2, "0")}`;

async function api(body: Record<string, unknown>) {
  const res = await fetch("/api/demo-web", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Try again in a minute.");
  return data;
}

function endTicket(ticketId: string) {
  const body = JSON.stringify({ action: "end", ticketId });
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/demo-web", new Blob([body], { type: "application/json" }));
  } else {
    void fetch("/api/demo-web", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  }
}

/**
 * Talk to the demo receptionist from the browser. Visitors wait in a real line
 * for one of a few slots; each call is three minutes at most.
 */
export function TalkInBrowser({ phoneHref, phoneDisplay }: { phoneHref: string; phoneDisplay: string }) {
  const [view, setView] = useState<View>({ state: "checking" });
  const [lines, setLines] = useState<Line[]>([]);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const vapiRef = useRef<VapiClient | null>(null);
  const ticketRef = useRef<string | null>(null);

  const apply = useCallback((data: ServerView) => {
    if (data.state === "open") return setView({ state: "idle" });
    if (data.state === "closed") return setView({ state: "closed", reason: data.reason });
    if (data.state === "done") return setView({ state: "done" });
    ticketRef.current = data.ticketId;
    if (data.state === "waiting") return setView(data);
    if (data.state === "ready") return setView({ state: "ready", ticketId: data.ticketId });
    return setView({ state: "live", ticketId: data.ticketId, startedAt: Date.now() });
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/demo-web", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { state: "closed", reason: "off" }))
      .then((data: ServerView) => {
        if (!live) return;
        if (data.state === "closed" && data.reason === "off") setView({ state: "hidden" });
        else apply(data);
      })
      .catch(() => live && setView({ state: "hidden" }));
    return () => {
      live = false;
    };
  }, [apply]);

  const waitingTicket = view.state === "waiting" ? view.ticketId : null;
  useEffect(() => {
    if (!waitingTicket) return;
    const id = window.setInterval(() => {
      fetch(`/api/demo-web?ticket=${encodeURIComponent(waitingTicket)}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: ServerView | null) => data && apply(data))
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [waitingTicket, apply]);

  const isLive = view.state === "live";
  useEffect(() => {
    if (!isLive) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isLive]);

  useEffect(() => {
    if (view.state === "ready") document.title = "Your turn · Orvius";
  }, [view.state]);

  useEffect(() => {
    const leave = () => {
      if (ticketRef.current) endTicket(ticketRef.current);
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      void vapiRef.current?.stop().catch(() => undefined);
    };
  }, []);

  const finish = useCallback(() => {
    const ticketId = ticketRef.current;
    ticketRef.current = null;
    if (ticketId) endTicket(ticketId);
    setSpeaking(false);
    setView((v) => (v.state === "error" ? v : { state: "done" }));
  }, []);

  const start = useCallback(
    async (ticketId: string) => {
      setView({ state: "connecting", ticketId });
      setLines([]);
      try {
        const data = await api({ action: "start", ticketId });
        const { default: Vapi } = await import("@vapi-ai/web");
        const vapi = (vapiRef.current ?? new Vapi("orvius-web-demo")) as unknown as VapiClient;
        if (!vapiRef.current) {
          vapiRef.current = vapi;
          vapi.on("speech-start", () => setSpeaking(true));
          vapi.on("speech-end", () => setSpeaking(false));
          vapi.on("call-end", () => finish());
          vapi.on("error", () => finish());
          vapi.on("message", (raw) => {
            const m = raw as { type?: string; transcriptType?: string; role?: string; transcript?: string };
            if (m?.type !== "transcript" || m.transcriptType !== "final" || !m.transcript) return;
            const role: Line["role"] = m.role === "user" ? "user" : "assistant";
            setLines((prev) => [...prev, { role, text: m.transcript as string }].slice(-6));
          });
        }
        await vapi.reconnect(data.call);
        setMuted(false);
        setNow(Date.now());
        setView({ state: "live", ticketId, startedAt: Date.now() });
      } catch (error) {
        ticketRef.current = null;
        endTicket(ticketId);
        const message = error instanceof Error && /microphone|permission|NotAllowed/i.test(error.message)
          ? "Your browser blocked the microphone. Allow it and join the line again."
          : error instanceof Error && error.message
            ? error.message
            : "The demo didn't connect. Try again in a minute.";
        setView({ state: "error", message });
      }
    },
    [finish],
  );

  const join = useCallback(async () => {
    setView({ state: "joining" });
    try {
      const data = (await api({ action: "join" })) as ServerView;
      if (data.state === "ready") {
        ticketRef.current = data.ticketId;
        return void start(data.ticketId);
      }
      apply(data);
    } catch (error) {
      setView({ state: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  }, [apply, start]);

  const hangUp = useCallback(() => {
    void vapiRef.current?.stop().catch(() => undefined);
    finish();
  }, [finish]);

  const leaveLine = useCallback(() => {
    finish();
    setView({ state: "idle" });
  }, [finish]);

  if (view.state === "checking" || view.state === "hidden") return null;

  const fallback = (
    <p className="tib-fallback font-sans">
      Or <a href={phoneHref}>call {phoneDisplay}</a> from your phone, or <Link href="/watch">watch a real call</Link>.
    </p>
  );

  return (
    <section className="tib" aria-label="Talk to Orvius in your browser" aria-live="polite">
      {view.state === "idle" && (
        <>
          <button type="button" className="ov-btn ov-btn--solid tib-go" onClick={join}>
            <span className="tib-mic" aria-hidden /> Talk to it in your browser
          </button>
          <p className="tib-note font-sans">Uses your microphone. You talk to a demo HVAC shop; calls end after 3 minutes.</p>
        </>
      )}

      {view.state === "joining" && <p className="tib-status font-sans">Getting you a place in line…</p>}

      {view.state === "waiting" && (
        <div className="tib-card">
          <p className="tib-status font-sans">
            <strong>You&apos;re number {view.position} in line.</strong> About {minutes(view.waitSeconds)} to wait.
          </p>
          <p className="tib-note font-sans">
            {view.talkingNow} {view.talkingNow === 1 ? "person is" : "people are"} talking to it now. Keep this tab open; it moves on its own.
          </p>
          <button type="button" className="ov-btn ov-btn--quiet" onClick={leaveLine}>
            Leave the line
          </button>
          {fallback}
        </div>
      )}

      {view.state === "ready" && (
        <div className="tib-card">
          <p className="tib-status font-sans">
            <strong>Your turn.</strong> Your slot is held for about a minute.
          </p>
          <button type="button" className="ov-btn ov-btn--solid tib-go" onClick={() => start(view.ticketId)}>
            <span className="tib-mic" aria-hidden /> Start talking
          </button>
        </div>
      )}

      {view.state === "connecting" && <p className="tib-status font-sans">Connecting. Allow the microphone if your browser asks…</p>}

      {view.state === "live" && (
        <div className="tib-card tib-card--live">
          <div className="tib-live-head font-sans">
            <span className={speaking ? "tib-dot tib-dot--talking" : "tib-dot"} aria-hidden />
            <span>{speaking ? "Orvius is talking" : "Listening"}</span>
            <span className="tib-timer">{minutes(Math.max(0, MAX_SECONDS - Math.floor((now - view.startedAt) / 1000)))} left</span>
          </div>
          <p className="tib-note font-sans">Try: &ldquo;My AC stopped blowing cold, can someone come today?&rdquo;</p>
          {lines.length > 0 && (
            <ol className="tib-transcript font-sans">
              {lines.map((line, i) => (
                <li key={i} className={`tib-line tib-line--${line.role}`}>
                  <span className="tib-who">{line.role === "user" ? "You" : "Orvius"}</span> {line.text}
                </li>
              ))}
            </ol>
          )}
          <div className="tib-controls">
            <button
              type="button"
              className="ov-btn ov-btn--quiet"
              aria-pressed={muted}
              onClick={() => {
                vapiRef.current?.setMuted(!muted);
                setMuted(!muted);
              }}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" className="ov-btn ov-btn--solid tib-hang" onClick={hangUp}>
              Hang up
            </button>
          </div>
        </div>
      )}

      {view.state === "done" && (
        <div className="tib-card">
          <p className="tib-status font-sans">
            <strong>That&apos;s the call your customers get.</strong> In a real shop the job, the text to the customer and the alert to you happen while you&apos;re still on the roof.
          </p>
          <div className="tib-controls">
            <Link href={SIGNUP_HREF} className="ov-btn ov-btn--solid">
              Get your line
            </Link>
            <Link href="/watch" className="ov-btn ov-btn--quiet">
              See what happens after the call
            </Link>
          </div>
        </div>
      )}

      {view.state === "closed" && (
        <div className="tib-card">
          <p className="tib-status font-sans">{CLOSED_COPY[view.reason]}</p>
          {fallback}
        </div>
      )}

      {view.state === "error" && (
        <div className="tib-card">
          <p className="tib-status font-sans" role="alert">
            {view.message}
          </p>
          <button type="button" className="ov-btn ov-btn--quiet" onClick={() => setView({ state: "idle" })}>
            Try again
          </button>
          {fallback}
        </div>
      )}
    </section>
  );
}
