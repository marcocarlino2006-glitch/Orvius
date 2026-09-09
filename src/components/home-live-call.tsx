"use client";

import { useEffect, useMemo, useState } from "react";

type Speaker = "orvius" | "caller";

type Beat = {
  who: Speaker;
  text: string;
  /** Fields the intake has captured once this line finishes. */
  captures?: Partial<Record<FieldKey, string>>;
  /** Stage the status rail reaches once this line finishes. */
  stage?: number;
};

type FieldKey = "service" | "urgency" | "address" | "callback" | "window";

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
    stage: 1,
  },
  {
    who: "caller",
    text: "My AC stopped cooling. Can someone come today?",
    captures: { service: "AC not cooling", urgency: "Same day" },
  },
  {
    who: "orvius",
    text: "I can help. What's the address and a callback number?",
  },
  {
    who: "caller",
    text: "1842 Oak Street. 512-555-0123.",
    captures: { address: "1842 Oak Street", callback: "512-555-0123" },
    stage: 2,
  },
  {
    who: "orvius",
    text: "Got it. I'll mark this same-day and check the next open window.",
    captures: { window: "Today · 4–6 PM" },
    stage: 3,
  },
  {
    who: "orvius",
    text: "Your window will arrive by text to confirm. The owner has your request.",
    stage: 4,
  },
];

const TYPE_MS = 18;
const LINE_PAUSE_MS = 620;
const LOOP_PAUSE_MS = 3200;

/** Everything the animation conveys, written out for assistive technology. */
const TEXT_ALTERNATIVE = `Representative after-hours call for Summit HVAC. Orvius answers, the caller reports an air conditioner that stopped cooling and asks for same-day service, and Orvius collects the address 1842 Oak Street and callback number 512-555-0123. Orvius captures the service, urgency, address, callback number, and a proposed window of today between 4 and 6 PM, then books the job and alerts the owner. Orvius confirms the window arrives by text and never quotes a price or an arrival time.`;

function completedState(upTo: number) {
  const captured: Partial<Record<FieldKey, string>> = {};
  let stage = 0;
  SCRIPT.slice(0, upTo).forEach((beat) => {
    Object.assign(captured, beat.captures ?? {});
    if (beat.stage) stage = beat.stage;
  });
  return { captured, stage };
}

export function HomeLiveCall() {
  const [reduced, setReduced] = useState(false);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Type the active line, hold, advance, and restart the call after the last beat.
  useEffect(() => {
    if (reduced) return;
    const beat = SCRIPT[index];
    if (typed < beat.text.length) {
      const timer = window.setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
      return () => window.clearTimeout(timer);
    }
    const last = index === SCRIPT.length - 1;
    const timer = window.setTimeout(
      () => {
        if (last) {
          setIndex(0);
          setSeconds(0);
        } else {
          setIndex((n) => n + 1);
        }
        setTyped(0);
      },
      last ? LOOP_PAUSE_MS : LINE_PAUSE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [index, typed, reduced]);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [reduced]);

  const view = useMemo(() => {
    if (reduced) {
      const { captured, stage } = completedState(SCRIPT.length);
      return {
        lines: SCRIPT.map((beat) => ({ ...beat, full: true })),
        captured,
        stage,
        typing: false,
      };
    }
    const { captured, stage } = completedState(index);
    return {
      lines: [
        ...SCRIPT.slice(0, index).map((beat) => ({ ...beat, full: true })),
        { ...SCRIPT[index], full: false },
      ],
      captured,
      stage,
      typing: true,
    };
  }, [index, reduced]);

  const clock = reduced ? 42 : seconds;

  return (
    <figure className="ov-console" aria-label={TEXT_ALTERNATIVE} role="img">
      <div className="ov-console-frame" aria-hidden>
        <header className="ov-console-head">
          <span className="ov-console-shop">Summit HVAC</span>
          <span className="ov-console-sep">·</span>
          <span className="ov-console-context">after-hours line</span>
          <span className="ov-console-live">
            <i className={reduced ? "" : "is-pulsing"} />
            Live
          </span>
          <time className="ov-console-clock">
            {`0:${String(clock % 60).padStart(2, "0")}`}
          </time>
        </header>

        <div className="ov-console-body">
          <div className="ov-console-wire">
            {view.lines.map((line, i) => {
              const shown = line.full
                ? line.text
                : line.text.slice(0, typed);
              return (
                <p
                  key={`${i}-${line.text}`}
                  className={`ov-wire-line ov-wire-line--${line.who}`}
                >
                  <span className="ov-wire-who">
                    {line.who === "orvius" ? "Orvius" : "Caller"}
                  </span>
                  <span className="ov-wire-text">
                    {shown}
                    {!line.full && view.typing ? (
                      <i className="ov-wire-caret" />
                    ) : null}
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
                    className={[
                      "ov-capture-row",
                      value ? "is-set" : "",
                    ]
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
              <i />
              {stage}
            </span>
          ))}
        </footer>
      </div>

      <figcaption className="ov-console-caption">
        Representative call · Summit HVAC is Orvius&rsquo;s labeled reference
        implementation, not a customer case study.
      </figcaption>
    </figure>
  );
}
