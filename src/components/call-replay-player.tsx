"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Replay } from "@/lib/call-replay-copy";

/** Gap before each line: the call's own timing when known, held to a pace people will watch. */
function delays(replay: Replay): number[] {
  return replay.turns.map((turn, i) => {
    const prev = replay.turns[i - 1];
    const real = prev && turn.at != null && prev.at != null ? (turn.at - prev.at) * 1000 : null;
    const reading = Math.min(2600, 500 + (prev?.text.length ?? 0) * 22);
    return i === 0 ? 400 : Math.max(600, Math.min(real ?? reading, 2600));
  });
}

export function CallReplayPlayer({ replay }: { replay: Replay }) {
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const done = shown >= replay.turns.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(replay.turns.length);
      return;
    }
    setShown(0);
    const waits = delays(replay);
    const timers: number[] = [];
    let total = 0;
    waits.forEach((wait, i) => {
      total += wait;
      timers.push(window.setTimeout(() => setShown(i + 1), total));
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [replay, run]);

  useEffect(() => {
    if (shown > 0) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [shown]);

  const tryHref = `/try?utm_source=replay&utm_medium=share&utm_campaign=${encodeURIComponent(replay.id)}`;
  const capture = replay.capture;
  const captured = capture && (capture.serviceType || capture.urgency || capture.firstName);

  return (
    <div className="rp">
      <header className="rp-head">
        <p className="rp-kicker">Call Replay</p>
        <h1 className="rp-title">Orvius answered the phone as {replay.shopName}.</h1>
        <p className="rp-sub">
          The owner called their own line to try it. This is the call as it happened. Numbers and emails are hidden.
        </p>
      </header>

      <div className="rp-call" aria-live="polite">
        {replay.turns.slice(0, shown).map((turn, i) => (
          <div key={`${run}-${i}`} className={`rp-turn rp-turn--${turn.who}`}>
            <span className="rp-who">{turn.who === "ai" ? replay.shopName : "Caller"}</span>
            <p className="rp-text">{turn.text}</p>
          </div>
        ))}
        {!done ? <p className="rp-typing" aria-hidden>…</p> : null}
        {done && captured ? (
          <div className="rp-card">
            <p className="rp-card-kicker">Texted to the owner when the call ended</p>
            <p className="rp-card-line">
              {[capture.urgency, capture.serviceType].filter(Boolean).join(" · ") || "New call"}
            </p>
            {capture.firstName ? <p className="rp-card-meta">{capture.firstName}</p> : null}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="rp-actions">
        <Link href={tryHref} className="ov-btn ov-btn--solid">
          Hear your business answer
        </Link>
        {done ? (
          <button type="button" className="ov-btn ov-btn--quiet" onClick={() => setRun((n) => n + 1)}>
            Play again
          </button>
        ) : null}
      </div>
    </div>
  );
}
