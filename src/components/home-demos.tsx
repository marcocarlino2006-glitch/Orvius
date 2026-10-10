"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { WORDMARK_PATH, WORDMARK_VIEWBOX } from "@/lib/orvius-wordmark";
import "./home-demos.css";

type Biz = {
  id: string;
  name: string;
  kind: string;
  owner: string;
  greeting: string;
  asks: string[];
  safety: string;
  queue: { who: string; what: string; tag: "Emergency" | "Booked" | "Call back" | "New"; when: string; value: string }[];
  calls: { who: string; what: string; grade: "Clean" | "Worth a listen" }[];
  transcript: [string, string][];
  confirm: { when: string; with: string; service: string; place: string };
  earlier: { when: string; what: string }[];
};

const BIZ: Biz[] = [
  {
    id: "hvac",
    name: "Summit Heating & Air",
    kind: "Heating & cooling",
    owner: "Dana",
    greeting: "Thanks for calling Summit Heating & Air, this is Orvius. What's going on?",
    asks: ["Problem", "Address", "Callback number", "Urgency"],
    safety: "Carbon monoxide alarm: told to get everyone outside and call 911, then you're paged",
    queue: [
      { who: "Priya Raman", what: "No heat, furnace lockout", tag: "Emergency", when: "6:30 PM", value: "Diagnostic" },
      { who: "Hal Bergstrom", what: "AC tune-up before summer", tag: "Booked", when: "Thu 9–11", value: "Tune-up" },
      { who: "Junie Alvarez", what: "Quote for a new system", tag: "Call back", when: "Today", value: "Estimate" },
      { who: "Wes Trahan", what: "Thermostat keeps resetting", tag: "New", when: "—", value: "Repair" },
    ],
    calls: [
      { who: "Priya Raman", what: "No heat", grade: "Clean" },
      { who: "Hal Bergstrom", what: "AC tune-up", grade: "Clean" },
      { who: "Junie Alvarez", what: "System quote", grade: "Worth a listen" },
      { who: "Wes Trahan", what: "Thermostat", grade: "Clean" },
    ],
    transcript: [
      ["Caller", "Our furnace stopped and the house is getting cold."],
      ["Orvius", "Is a carbon monoxide alarm going off, or does anyone feel dizzy?"],
      ["Caller", "No, it's just not coming on."],
      ["Orvius", "I can get a technician there at 6:30 tonight. What's the address?"],
    ],
    confirm: { when: "Tonight 6:30 PM", with: "Ray", service: "No heat", place: "418 Quarry Rd" },
    earlier: [
      { when: "8:00 AM", what: "Furnace tune-up · Elm Ct" },
      { when: "11:30 AM", what: "Thermostat swap · Birch Ln" },
      { when: "2:15 PM", what: "Duct inspection · Pine Ave" },
    ],
  },
  {
    id: "plumbing",
    name: "Rapid Flow Plumbing",
    kind: "Plumbing",
    owner: "Sam",
    greeting: "Rapid Flow Plumbing, this is Orvius. What's going on?",
    asks: ["Issue", "Address", "Callback number", "Urgency"],
    safety: "Gas smell: told to leave the house and call 911, then you're paged",
    queue: [
      { who: "Tom Becker", what: "Water heater leaking into garage", tag: "Emergency", when: "7:00 AM", value: "Emergency" },
      { who: "Grace Lin", what: "Kitchen drain backing up", tag: "Booked", when: "Today 2–4", value: "Repair" },
      { who: "Owen Park", what: "Quote for repiping", tag: "Call back", when: "Today", value: "Estimate" },
      { who: "Rosa Diaz", what: "Running toilet", tag: "New", when: "—", value: "Repair" },
    ],
    calls: [
      { who: "Tom Becker", what: "Water heater leak", grade: "Clean" },
      { who: "Grace Lin", what: "Drain backing up", grade: "Clean" },
      { who: "Owen Park", what: "Repiping quote", grade: "Worth a listen" },
      { who: "Rosa Diaz", what: "Running toilet", grade: "Clean" },
    ],
    transcript: [
      ["Caller", "My water heater is leaking all over the garage."],
      ["Orvius", "Is the water near anything electrical, and do you smell gas?"],
      ["Caller", "No gas. It's just a lot of water."],
      ["Orvius", "Shut the cold valve on top. I can get someone there at 7 AM."],
    ],
    confirm: { when: "Wed 7:00 AM", with: "Chris", service: "Water heater leak", place: "1842 Oak St" },
    earlier: [
      { when: "Tue 9:00 AM", what: "Disposal install · Maple Dr" },
      { when: "Tue 1:00 PM", what: "Leak under sink · Cedar St" },
      { when: "Tue 3:30 PM", what: "Drain clear · Ash Way" },
    ],
  },
];

const CYCLE_MS = 7000;

function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView] as const;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Rotates through the example businesses while on screen; a pill click pins one. */
function useBusiness() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!inView || pinned || reduced) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % BIZ.length), CYCLE_MS);
    return () => window.clearInterval(t);
  }, [inView, pinned, reduced]);
  return {
    ref,
    inView,
    reduced,
    biz: BIZ[index],
    index,
    pick: (i: number) => {
      setIndex(i);
      setPinned(true);
    },
  };
}

function useTyped(text: string, active: boolean, reduced: boolean, speed = 28) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
  }, [text]);
  useEffect(() => {
    if (!active || reduced || n >= text.length) return;
    const t = window.setTimeout(() => setN((x) => x + 1), speed);
    return () => window.clearTimeout(t);
  }, [active, reduced, n, text, speed]);
  return reduced ? text : text.slice(0, n);
}

function Pills({ index, pick }: { index: number; pick: (i: number) => void }) {
  return (
    <div className="hd-pills" role="tablist" aria-label="Example business">
      {BIZ.map((b, i) => (
        <button
          key={b.id}
          type="button"
          role="tab"
          aria-selected={i === index}
          className={i === index ? "is-on" : ""}
          onClick={() => pick(i)}
        >
          {b.kind}
        </button>
      ))}
    </div>
  );
}

function Window({ title, biz, children, nav }: { title: string; biz: Biz; children: ReactNode; nav?: string }) {
  const items = ["Command", "Inbox", "Calls", "Customers", "Schedule", "Settings"];
  return (
    <div className="hd-window" aria-hidden>
      <aside className="hd-side">
        <span className="hd-logo" role="img" aria-label="Orvius">
          <svg viewBox={WORDMARK_VIEWBOX} aria-hidden>
            <path d={WORDMARK_PATH} fill="currentColor" />
          </svg>
        </span>
        <span className="hd-shop">{biz.name}</span>
        <ul>
          {items.map((x) => (
            <li key={x} className={x === nav ? "is-on" : ""}>
              {x}
            </li>
          ))}
        </ul>
      </aside>
      <div className="hd-main">
        <header className="hd-top">
          <span>{title}</span>
          <span className="hd-live">
            <i /> Line live
          </span>
        </header>
        <div className="hd-body" key={biz.id}>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Every example business is rendered into the same slot and only the current
 * one is shown, so the slot is always as tall as the longest. Where the panel
 * takes its demo's height (phones) the page never jumps as the examples rotate.
 */
function Shell({
  ctl,
  render,
}: {
  ctl: ReturnType<typeof useBusiness>;
  render: (biz: Biz, live: boolean) => ReactNode;
}) {
  return (
    <div ref={ctl.ref} className={`hd-demo ${ctl.inView ? "is-in" : ""}`}>
      <div className="hd-stage">
        {BIZ.map((b, i) => {
          const live = i === ctl.index;
          return (
            <div key={`${b.id}-${live}`} className={`hd-slide ${live ? "is-on" : ""}`} aria-hidden>
              {render(b, live)}
            </div>
          );
        })}
      </div>
      <p className="hd-example">Example business, not a customer. This is how Orvius looks with sample calls.</p>
      <Pills index={ctl.index} pick={ctl.pick} />
    </div>
  );
}

export function ReceptionistDemo() {
  const ctl = useBusiness();
  const typed = useTyped(ctl.biz.greeting, ctl.inView, ctl.reduced);
  return (
    <Shell
      ctl={ctl}
      render={(biz, live) => (
        <Window title="Receptionist" biz={biz} nav="Settings">
          <div className="hd-field">
            <span className="hd-label">Business type</span>
            <span className="hd-select">{biz.kind}</span>
          </div>
          <div className="hd-field">
            <span className="hd-label">Opening line</span>
            <span className="hd-input">
              {live ? typed : biz.greeting}
              <b className="hd-caret" />
            </span>
          </div>
          <div className="hd-field">
            <span className="hd-label">Asks every caller</span>
            <span className="hd-chips">
              {biz.asks.map((a, i) => (
                <span key={a} style={{ animationDelay: `${300 + i * 120}ms` }}>
                  {a}
                </span>
              ))}
            </span>
          </div>
          <div className="hd-field">
            <span className="hd-label">Safety first</span>
            <span className="hd-note">{biz.safety}</span>
          </div>
          <div className="hd-field hd-field--row">
            <span className="hd-label">Voice</span>
            <span className="hd-select">Iris · Warm</span>
            <span className="hd-toggle is-on" />
            <span className="hd-label">English and Spanish</span>
          </div>
        </Window>
      )}
    />
  );
}

const TAG_CLASS: Record<Biz["queue"][number]["tag"], string> = {
  Emergency: "is-red",
  Booked: "is-green",
  "Call back": "is-amber",
  New: "is-blue",
};

export function BoardDemo() {
  const ctl = useBusiness();
  return (
    <Shell
      ctl={ctl}
      render={(biz) => {
        const booked = biz.queue.filter((q) => q.tag === "Booked" || q.tag === "Emergency").length;
        return (
          <Window title="Command" biz={biz} nav="Command">
            <p className="hd-greet">Good morning, {biz.owner}.</p>
            <p className="hd-headline">
              {biz.queue.length} calls overnight, {booked} already booked.
            </p>
            <div className="hd-stats">
              <span>
                <b>{biz.queue.length}</b> new
              </span>
              <span>
                <b>{booked}</b> booked
              </span>
              <span>
                <b>{biz.queue.filter((q) => q.tag === "Call back").length}</b> need you
              </span>
            </div>
            <ul className="hd-queue">
              {biz.queue.map((q, i) => (
                <li key={q.who} style={{ animationDelay: `${200 + i * 260}ms` }}>
                  <span className={`hd-tag ${TAG_CLASS[q.tag]}`}>{q.tag}</span>
                  <span className="hd-who">
                    <b>{q.who}</b>
                    <small>{q.what}</small>
                  </span>
                  <span className="hd-when">{q.when}</span>
                  <span className="hd-value">{q.value}</span>
                </li>
              ))}
            </ul>
          </Window>
        );
      }}
    />
  );
}

export function CallsDemo() {
  const ctl = useBusiness();
  return (
    <Shell
      ctl={ctl}
      render={(biz) => {
        const lead = biz.queue[0];
        return (
          <Window title="Calls" biz={biz} nav="Calls">
            <div className="hd-split">
              <ul className="hd-calls">
                {biz.calls.map((c, i) => (
                  <li
                    key={c.who + c.what}
                    className={i === 0 ? "is-on" : ""}
                    style={{ animationDelay: `${i * 140}ms` }}
                  >
                    <span className="hd-who">
                      <b>{c.who}</b>
                      <small>{c.what}</small>
                    </span>
                    <span className={`hd-tag ${c.grade === "Clean" ? "is-green" : "is-amber"}`}>{c.grade}</span>
                  </li>
                ))}
              </ul>
              <div className="hd-transcript">
                <span className="hd-label">Transcript · recorded</span>
                {biz.transcript.map(([who, text], i) => (
                  <p
                    key={i}
                    className={who === "Orvius" ? "is-us" : ""}
                    style={{ animationDelay: `${300 + i * 700}ms` }}
                  >
                    <span>{who}</span>
                    {text}
                  </p>
                ))}
                <p
                  className="hd-summary"
                  style={{
                    animationDelay: `${300 + biz.transcript.length * 700}ms`,
                  }}
                >
                  <span>Summary</span>
                  {lead.what}. {lead.tag === "Call back" ? "Wants a callback." : `Booked ${lead.when}.`}
                </p>
              </div>
            </div>
          </Window>
        );
      }}
    />
  );
}

export function PhonesDemo() {
  const ctl = useBusiness();
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
  }, [ctl.biz.id]);
  useEffect(() => {
    if (!ctl.inView || ctl.reduced || step >= 3) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), 1100);
    return () => window.clearTimeout(t);
  }, [ctl.inView, ctl.reduced, step]);
  return (
    <Shell
      ctl={ctl}
      render={(biz, live) => {
        const s = live && !ctl.reduced ? step : 3;
        return (
          <div className="hd-phones">
            <div className="hd-phone">
              <span className="hd-phone-head">
                <i className="hd-avatar">{biz.name.charAt(0)}</i>
                {biz.name}
              </span>
              <div className="hd-sms">
                <p className="hd-bubble">
                  Thanks for calling {biz.name}. We have your request for {biz.confirm.service.toLowerCase()} at{" "}
                  {biz.confirm.place}.
                </p>
                <p className={`hd-bubble ${s >= 1 ? "" : "is-pending"}`}>
                  You&apos;re booked {biz.confirm.when} with {biz.confirm.with}. Tap to confirm: orvius.im/c/8f2k
                </p>
                <p className={`hd-bubble hd-bubble--me ${s >= 2 ? "" : "is-pending"}`}>Confirmed ✓</p>
                <p className={`hd-bubble ${s >= 3 ? "" : "is-pending"}`}>
                  See you then. Reply here if anything changes.
                </p>
              </div>
              <span className="hd-compose">Text message</span>
            </div>
            <div className="hd-phone hd-phone--team">
              <span className="hd-phone-head">Your day · {biz.confirm.with}</span>
              <div className="hd-job">
                <span className="hd-label">Next job</span>
                <p className="hd-job-when">{biz.confirm.when}</p>
                <p className="hd-job-what">{biz.confirm.service}</p>
                <p className="hd-job-where">{biz.confirm.place}</p>
                <span className={`hd-tag ${s >= 2 ? "is-green" : "is-amber"}`}>
                  {s >= 2 ? "Customer confirmed" : "Waiting on customer"}
                </span>
              </div>
              <ul className="hd-done">
                {biz.earlier.map((e, i) => {
                  const paid = i < biz.earlier.length - 1;
                  return (
                    <li key={e.when}>
                      <span>{e.when}</span>
                      {e.what}
                      <b className={paid ? "is-paid" : ""}>{paid ? "Paid" : "Bill sent"}</b>
                    </li>
                  );
                })}
              </ul>
              <div className="hd-job-actions">
                <span>Call</span>
                <span>{biz.id === "plumbing" ? "Directions" : "Notes"}</span>
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
