"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Speaker = "orvius" | "caller";

type FieldKey = "service" | "urgency" | "address" | "callback" | "window";

type Beat = {
  who: Speaker;
  text: string;
  /** Seconds this line occupies on the timeline. */
  duration: number;
  /** Silence after the line, before the next speaker starts. */
  gap: number;
  /** Fields the intake has captured once this line finishes. */
  captures?: Partial<Record<FieldKey, string>>;
  /** Stage the status rail reaches once this line finishes. */
  stage?: number;
};

const FIELDS: Array<{ key: FieldKey; label: string }> = [
  { key: "service", label: "Service" },
  { key: "urgency", label: "Urgency" },
  { key: "address", label: "Address" },
  { key: "callback", label: "Callback" },
  { key: "window", label: "Window" },
];

const STAGES = ["Answered", "Qualified", "Booked", "Owner alerted"] as const;

/**
 * The same representative after-hours call the /pilot audit walks through, and
 * the same fields the receptionist prompt is contracted to capture. Nothing here
 * claims a price or an arrival time, because the product never does either.
 */
const SCRIPT: Beat[] = [
  {
    who: "orvius",
    text: "Thanks for calling Summit HVAC. How can I help?",
    duration: 3.2,
    gap: 0.5,
    stage: 1,
  },
  {
    who: "caller",
    text: "My AC stopped cooling. Can someone come today?",
    duration: 3.4,
    gap: 0.45,
    captures: { service: "AC not cooling", urgency: "Same day" },
  },
  {
    who: "orvius",
    text: "I can help. What's the address and a callback number?",
    duration: 3.6,
    gap: 0.6,
  },
  {
    who: "caller",
    text: "1842 Oak Street. 512-555-0123.",
    duration: 3,
    gap: 0.5,
    captures: { address: "1842 Oak Street", callback: "512-555-0123" },
    stage: 2,
  },
  {
    who: "orvius",
    text: "Got it. I'll mark this same-day and check the next open window.",
    duration: 4.2,
    gap: 0.55,
    captures: { window: "Today · 4–6 PM" },
    stage: 3,
  },
  {
    who: "orvius",
    text: "Your window will arrive by text to confirm. The owner has your request.",
    duration: 4.6,
    gap: 0.9,
    stage: 4,
  },
];

/** Beat start/end times, resolved once from the durations above. */
const TIMELINE = SCRIPT.reduce<
  { beat: Beat; start: number; end: number }[]
>((acc, beat) => {
  const start = acc.length ? acc[acc.length - 1].end + acc[acc.length - 1].beat.gap : 0;
  acc.push({ beat, start, end: start + beat.duration });
  return acc;
}, []);

const DURATION = TIMELINE[TIMELINE.length - 1].end + SCRIPT[SCRIPT.length - 1].gap;

const BAR_SECONDS = 0.16;
const BAR_COUNT = Math.round(DURATION / BAR_SECONDS);
const SEEK_STEP = 2;
const TICK_MS = 50;

/**
 * Speech envelope for the waveform, derived from the timeline rather than from
 * audio — there is no recording here and inventing one would be theatre. A bar
 * is tall while its speaker holds the line and flat in the gaps, so the shape
 * is an honest picture of who is talking when.
 *
 * The amplitude jitter is a fixed hash of the bar index, not Math.random, so
 * the server and the client draw the identical waveform and hydration is quiet.
 */
const BARS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const t = i * BAR_SECONDS;
  const slot = TIMELINE.find((entry) => t >= entry.start && t < entry.end);
  if (!slot) return { t, amplitude: 0.08, who: null as Speaker | null };

  const progress = (t - slot.start) / slot.beat.duration;
  // Ease in and out of each utterance so lines start and end on breath.
  const envelope = Math.sin(Math.PI * progress) ** 0.55;
  const jitter = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const amplitude = 0.22 + envelope * (0.45 + jitter * 0.33);
  return { t, amplitude: Math.min(1, amplitude), who: slot.beat.who };
});

/** Everything the player conveys, written out for assistive technology. */
const TEXT_ALTERNATIVE = `Representative after-hours call for Summit HVAC. Orvius answers, the caller reports an air conditioner that stopped cooling and asks for same-day service, and Orvius collects the address 1842 Oak Street and callback number 512-555-0123. Orvius captures the service, urgency, address, callback number, and a proposed window of today between 4 and 6 PM, then books the job and alerts the owner. Orvius confirms the window arrives by text and never quotes a price or an arrival time.`;

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function stateAt(time: number) {
  const captured: Partial<Record<FieldKey, string>> = {};
  let stage = 0;
  let activeIndex = -1;

  TIMELINE.forEach((entry, i) => {
    if (time >= entry.end) {
      Object.assign(captured, entry.beat.captures ?? {});
      if (entry.beat.stage) stage = entry.beat.stage;
    }
    if (time >= entry.start && activeIndex < i && time < entry.end) activeIndex = i;
  });

  // Between lines, keep the last spoken line lit rather than blanking the wire.
  const spokenCount = TIMELINE.filter((entry) => time >= entry.start).length;
  return { captured, stage, activeIndex, spokenCount };
}

export function HomeLiveCall() {
  const [reduced, setReduced] = useState(false);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const wireRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(query.matches);
      // Someone who asked the OS to stop motion gets the finished call, paused.
      if (query.matches) {
        setPlaying(false);
        setTime(DURATION);
      }
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!playing || scrubbing) return;
    const started = performance.now();
    const from = time;
    let frame = 0;
    const tick = () => {
      const next = from + (performance.now() - started) / 1000;
      if (next >= DURATION) {
        setTime(0);
      } else {
        setTime(next);
      }
      frame = window.setTimeout(tick, TICK_MS);
    };
    frame = window.setTimeout(tick, TICK_MS);
    return () => window.clearTimeout(frame);
    // `time` is the seek origin, deliberately not a dependency: re-reading it
    // every tick would restart the clock on each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, scrubbing]);

  const seekTo = useCallback((seconds: number) => {
    setTime(Math.min(DURATION, Math.max(0, seconds)));
  }, []);

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      seekTo(((clientX - rect.left) / rect.width) * DURATION);
    },
    [seekTo],
  );

  useEffect(() => {
    if (!scrubbing) return;
    const onMove = (event: PointerEvent) => seekFromPointer(event.clientX);
    const onUp = () => setScrubbing(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrubbing, seekFromPointer]);

  const view = useMemo(() => stateAt(time), [time]);

  // Follow the conversation as it advances, without hijacking the page scroll.
  useEffect(() => {
    const wire = wireRef.current;
    const active = wire?.querySelector<HTMLElement>(".ov-wire-line.is-active");
    if (!wire || !active) return;
    const target = active.offsetTop - wire.clientHeight + active.offsetHeight + 8;
    wire.scrollTo({ top: Math.max(0, target), behavior: reduced ? "auto" : "smooth" });
  }, [view.spokenCount, view.activeIndex, reduced]);

  function onTrackKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      seekTo(time + SEEK_STEP);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      seekTo(time - SEEK_STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      seekTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      seekTo(DURATION);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setPlaying((on) => !on);
    }
  }

  const progress = time / DURATION;
  const live = playing && !reduced;

  return (
    <figure className="ov-console">
      {/*
        The console is shown as a window on a machine rather than as a floating
        card, because what is being demonstrated is software running somewhere
        while the shop is closed. The desk supplies the screen: a bezel, a
        drifting wallpaper, and a menubar the window is docked under.
      */}
      <div className="ov-console-desk">
        <div className="ov-console-wallpaper" aria-hidden>
          <span className="ov-console-aurora ov-console-aurora--a" />
          <span className="ov-console-aurora ov-console-aurora--b" />
          <span className="ov-console-aurora ov-console-aurora--c" />
        </div>

        <div className="ov-console-menubar" aria-hidden>
          <span className="ov-console-lights">
            <i />
            <i />
            <i />
          </span>
          <span className="ov-console-menutitle">Orvius</span>
          <span className="ov-console-menuclock">2:14 AM</span>
        </div>

        <div className="ov-console-frame">
          <header className="ov-console-head">
            <span className="ov-console-shop">Summit HVAC</span>
            <span className="ov-console-sep" aria-hidden>
              ·
            </span>
            <span className="ov-console-context">after-hours line</span>
            <span className="ov-console-live" data-live={live}>
              <i />
              Live
            </span>
            <time className="ov-console-clock">{clock(time)}</time>
          </header>

          <div className="ov-console-body">
            <div className="ov-console-wire" ref={wireRef}>
              {TIMELINE.slice(0, Math.max(1, view.spokenCount)).map((entry, i) => {
                const active = i === view.activeIndex;
                const shown = active
                  ? entry.beat.text.slice(
                      0,
                      Math.ceil(
                        ((time - entry.start) / entry.beat.duration) *
                          entry.beat.text.length,
                      ),
                    )
                  : entry.beat.text;
                return (
                  <p
                    key={entry.start}
                    className={[
                      "ov-wire-line",
                      `ov-wire-line--${entry.beat.who}`,
                      active ? "is-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className="ov-wire-who">
                      {entry.beat.who === "orvius" ? "Orvius" : "Caller"}
                    </span>
                    <span className="ov-wire-text">
                      {shown}
                      {active && live ? <i className="ov-wire-caret" /> : null}
                    </span>
                  </p>
                );
              })}
            </div>

            <aside className="ov-console-capture">
              <p className="ov-capture-label">Captured</p>
              <dl className="ov-capture-list">
                {FIELDS.map((field) => {
                  const value = view.captured[field.key];
                  return (
                    // Keying on the value remounts the row the moment intake fills
                    // it, which replays the capture animation exactly once.
                    <div
                      key={`${field.key}-${value ?? "empty"}`}
                      className={["ov-capture-row", value ? "is-set" : ""]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <dt>{field.label}</dt>
                      <dd>{value ?? "—"}</dd>
                    </div>
                  );
                })}
              </dl>
            </aside>
          </div>

          <div className="ov-console-player">
            <button
              type="button"
              className="ov-player-toggle"
              aria-label={playing ? "Pause the call timeline" : "Play the call timeline"}
              onClick={() => setPlaying((on) => !on)}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>

            <div
              ref={trackRef}
              className="ov-player-track"
              role="slider"
              tabIndex={0}
              aria-label="Call timeline"
              aria-valuemin={0}
              aria-valuemax={Math.round(DURATION)}
              aria-valuenow={Math.round(time)}
              aria-valuetext={`${clock(time)} of ${clock(DURATION)}`}
              onKeyDown={onTrackKeyDown}
              onPointerDown={(event) => {
                event.preventDefault();
                setScrubbing(true);
                seekFromPointer(event.clientX);
              }}
            >
              {BARS.map((bar, i) => (
                <span
                  key={bar.t}
                  className={[
                    "ov-player-bar",
                    bar.who ? `ov-player-bar--${bar.who}` : "",
                    i / BARS.length <= progress ? "is-played" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ height: `${Math.round(bar.amplitude * 100)}%` }}
                />
              ))}
              <span className="ov-player-head" style={{ left: `${progress * 100}%` }} />
            </div>

            <span className="ov-player-time">
              {clock(time)} / {clock(DURATION)}
            </span>
          </div>

          <footer className="ov-console-rail">
            {STAGES.map((stage, i) => (
              <span
                key={stage}
                className={[
                  "ov-rail-step",
                  view.stage > i ? "is-done" : "",
                  view.stage === i ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <i aria-hidden />
                {stage}
              </span>
            ))}
          </footer>
        </div>
      </div>

      {/* The player is a visual timeline; this is the whole call in prose. */}
      <p className="sr-only">{TEXT_ALTERNATIVE}</p>

      <figcaption className="ov-console-caption">
        Representative call, transcript playback — no audio. Summit HVAC is
        Orvius&rsquo;s labeled reference implementation, not a customer case study.
      </figcaption>
    </figure>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
    </svg>
  );
}
