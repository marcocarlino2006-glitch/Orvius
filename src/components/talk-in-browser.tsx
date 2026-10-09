"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SIGNUP_HREF } from "@/lib/signup-href";
import { isHipaaTrade, TRADES } from "@/lib/trades";

const TRADE_CHOICES = TRADES.filter((t) => !isHipaaTrade(t));
type Capture = { name?: string; phone?: string; serviceType?: string; urgency?: string; address?: string };

const MAX_SECONDS = 180;
const POLL_MS = 3000;

type Line = { role: "assistant" | "user"; text: string };
type View =
  | { state: "checking" }
  | { state: "hidden" }
  | { state: "idle" }
  | { state: "joining" }
  | { state: "waiting"; ticketId: string; position: number; talkingNow: number; waitSeconds: number; pollSeconds?: number }
  | { state: "ready"; ticketId: string }
  | { state: "connecting"; ticketId: string }
  | { state: "live"; ticketId: string; startedAt: number }
  | { state: "done" }
  | { state: "closed"; reason: "daily" | "limit" | "off" }
  | { state: "error"; message: string };

type ServerView =
  | { state: "open" }
  | { state: "waiting"; ticketId: string; position: number; talkingNow: number; waitSeconds: number; pollSeconds?: number }
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
export function TalkInBrowser({ phoneHref, phoneDisplay, personal = false }: { phoneHref: string; phoneDisplay: string; personal?: boolean }) {
  const [view, setView] = useState<View>({ state: "checking" });
  const [shopName, setShopName] = useState("");
  const [trade, setTrade] = useState<string>("HVAC");
  const [city, setCity] = useState("");
  const [answeringAs, setAnsweringAs] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [replayReady, setReplayReady] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
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
  const pollMs = view.state === "waiting" && view.pollSeconds ? view.pollSeconds * 1000 : POLL_MS;
  useEffect(() => {
    if (!waitingTicket) return;
    const id = window.setInterval(() => {
      fetch(`/api/demo-web?ticket=${encodeURIComponent(waitingTicket)}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: ServerView | null) => data && apply(data))
        .catch(() => undefined);
    }, pollMs);
    return () => window.clearInterval(id);
  }, [waitingTicket, pollMs, apply]);

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
    setCapture(null);
    setReplayReady(false);
    setShareUrl(null);
    setShareNote(null);
    const name = shopName.trim();
    const asShop = personal && name.length >= 2;
    setAnsweringAs(asShop ? name : null);
    try {
      const data = (await api(
        asShop ? { action: "join", business: { name, trade, city: city.trim() || undefined } } : { action: "join" },
      )) as ServerView & { previewToken?: string };
      setPreviewToken(data.previewToken ?? null);
      if (data.state === "ready") {
        ticketRef.current = data.ticketId;
        return void start(data.ticketId);
      }
      apply(data);
    } catch (error) {
      setView({ state: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  }, [apply, start, personal, shopName, trade, city]);

  const isDone = view.state === "done";
  useEffect(() => {
    if (!isDone || !previewToken) return;
    let tries = 0;
    let stop = false;
    const tick = () => {
      fetch(`/api/preview/${previewToken}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { capture?: Capture | null; replayable?: boolean } | null) => {
          if (stop || !data) return;
          if (data.capture) setCapture(data.capture);
          if (data.replayable) setReplayReady(true);
          if ((!data.capture || !data.replayable) && ++tries < 15) window.setTimeout(tick, 2000);
        })
        .catch(() => undefined);
    };
    const first = window.setTimeout(tick, 1500);
    return () => {
      stop = true;
      window.clearTimeout(first);
    };
  }, [isDone, previewToken]);

  const share = useCallback(async () => {
    if (!previewToken) return;
    setShareNote(null);
    try {
      const res = await fetch(`/api/preview/${previewToken}/share`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't make the link. Try again.");
      setShareUrl(data.url);
      const text = `Orvius answered the phone as ${answeringAs ?? "my business"}.`;
      if (navigator.share) {
        await navigator.share({ title: text, text, url: data.url }).catch(() => undefined);
      } else {
        await navigator.clipboard?.writeText(data.url).catch(() => undefined);
        setShareNote("Link copied.");
      }
    } catch (e) {
      setShareNote(e instanceof Error ? e.message : "Couldn't make the link. Try again.");
    }
  }, [previewToken, answeringAs]);

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
        <form
          className={personal ? "tib-form" : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          {personal ? (
            <div className="tib-fields">
              <input
                className="tib-input font-sans"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Your business name"
                aria-label="Your business name"
                maxLength={80}
                autoComplete="organization"
              />
              <select className="tib-input tib-select font-sans" value={trade} onChange={(e) => setTrade(e.target.value)} aria-label="What you do">
                {TRADE_CHOICES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                className="tib-input font-sans"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City (optional)"
                aria-label="City you serve"
                maxLength={80}
                autoComplete="address-level2"
              />
            </div>
          ) : null}
          <button type="submit" className="ov-btn ov-btn--solid tib-go">
            <span className="tib-mic" aria-hidden />{" "}
            {personal && shopName.trim().length >= 2 ? `Hear it answer as ${shopName.trim()}` : "Talk to it in your browser"}
          </button>
          <p className="tib-note font-sans">
            {personal
              ? "Talk to it like a customer, in your browser. Uses your microphone, no account. Calls end after 3 minutes."
              : "Uses your microphone. You talk to a demo HVAC shop; calls end after 3 minutes."}
          </p>
        </form>
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
            <span>{speaking ? (answeringAs ? `${answeringAs} is talking` : "Orvius is talking") : "Listening"}</span>
            <span className="tib-timer">{minutes(Math.max(0, MAX_SECONDS - Math.floor((now - view.startedAt) / 1000)))} left</span>
          </div>
          <p className="tib-note font-sans">
            {answeringAs ? `You're the customer calling ${answeringAs}. Say what you need, like a real caller would.` : "Try: \u201cMy AC stopped blowing cold, can someone come today?\u201d"}
          </p>
          {lines.length > 0 && (
            <ol className="tib-transcript font-sans">
              {lines.map((line, i) => (
                <li key={i} className={`tib-line tib-line--${line.role}`}>
                  <span className="tib-who">{line.role === "user" ? "You" : (answeringAs ?? "Orvius")}</span> {line.text}
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

      {view.state === "done" && answeringAs && (
        <div className="tib-card">
          <p className="tib-status font-sans">
            <strong>That&apos;s how {answeringAs} would answer.</strong> On your real line this lands as a job and a text to you while you&apos;re on the roof.
          </p>
          {capture && (capture.serviceType || capture.urgency || capture.name) ? (
            <div className="tib-capture font-sans">
              <span className="tib-capture-kicker">The text you&apos;d get after this call</span>
              <span>{[capture.urgency, capture.serviceType].filter(Boolean).join(" · ") || "New call"}</span>
              {capture.name ? <span>{capture.name}</span> : null}
              {capture.address ? <span>{capture.address}</span> : null}
            </div>
          ) : (
            <p className="tib-note font-sans">Writing up the call…</p>
          )}
          <div className="tib-controls">
            <Link href={SIGNUP_HREF} className="ov-btn ov-btn--solid">
              Put it on my real line
            </Link>
            {replayReady ? (
              <button type="button" className="ov-btn ov-btn--quiet" onClick={share}>
                Share this call
              </button>
            ) : null}
            <button type="button" className="ov-btn ov-btn--quiet" onClick={() => setView({ state: "idle" })}>
              Call again
            </button>
          </div>
          {shareUrl ? (
            <p className="tib-note font-sans">
              <a href={shareUrl} target="_blank" rel="noreferrer">{shareUrl.replace(/^https?:\/\//, "")}</a>
              {shareNote ? ` · ${shareNote}` : ""}
            </p>
          ) : shareNote ? (
            <p className="tib-note font-sans" role="alert">{shareNote}</p>
          ) : null}
        </div>
      )}

      {view.state === "done" && !answeringAs && (
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
