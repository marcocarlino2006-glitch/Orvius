"use client";

import { useEffect, useRef, useState } from "react";

type Capability = {
  id: string;
  title: string;
  body: string;
  visual: React.ReactNode;
};

const WAVE = [4, 7, 11, 6, 13, 9, 15, 8, 12, 5, 10, 14, 7, 11, 6, 9, 13, 5, 8, 12, 6, 10, 4, 7];

const capabilities: Capability[] = [
  {
    id: "answer",
    title: "Answers every call",
    body: "After hours, lunch rush, or when every tech is on a roof. The line picks up in your shop's name and never sends a caller to voicemail.",
    visual: (
      <div className="hx-mock hx-mock--call">
        <div className="hx-mock-bar">
          <span className="hx-dot hx-dot--live" aria-hidden />
          <span>Incoming call</span>
          <span className="hx-mock-time">11:42 PM</span>
        </div>
        <p className="hx-mock-big">(512) 555-0148</p>
        <p className="hx-mock-sub">Summit HVAC · after-hours line</p>
        <div className="hx-wave" aria-hidden>
          {WAVE.map((h, i) => (
            <span key={i} style={{ height: `${h * 3}px`, animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
        <div className="hx-mock-foot">
          <span className="hx-pill hx-pill--good">Answered</span>
          <span className="hx-mono">0:07</span>
        </div>
      </div>
    ),
  },
  {
    id: "qualify",
    title: "Qualifies the job",
    body: "Trade-specific intake: what broke, where, how urgent, and what equipment. Every answer lands on the customer record, not a sticky note.",
    visual: (
      <div className="hx-mock">
        <div className="hx-mock-bar">
          <span>Intake</span>
          <span className="hx-pill hx-pill--risk">Emergency</span>
        </div>
        <dl className="hx-fields">
          <div>
            <dt>Issue</dt>
            <dd>No heat, furnace short-cycling</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>2214 Barton Hills Dr</dd>
          </div>
          <div>
            <dt>Equipment</dt>
            <dd>Gas furnace, about 12 years old</dd>
          </div>
          <div>
            <dt>Household</dt>
            <dd>Two kids at home, 58°F inside</dd>
          </div>
        </dl>
      </div>
    ),
  },
  {
    id: "book",
    title: "Proposes a window",
    body: "Offers real openings from your schedule and holds the one the caller picks. You approve it, or let routine work book itself.",
    visual: (
      <div className="hx-mock">
        <div className="hx-mock-bar">
          <span>Proposed windows</span>
          <span className="hx-mock-time">Tomorrow</span>
        </div>
        <ul className="hx-slots">
          <li>7:00 – 9:00 AM</li>
          <li className="is-picked">
            8:00 – 10:00 AM <span className="hx-pill hx-pill--good">Caller picked</span>
          </li>
          <li>1:00 – 3:00 PM</li>
          <li className="is-full">3:00 – 5:00 PM · full</li>
        </ul>
      </div>
    ),
  },
  {
    id: "alert",
    title: "Alerts the owner",
    body: "Emergencies reach you right away with the summary already written. Routine calls wait quietly for the morning queue.",
    visual: (
      <div className="hx-mock hx-mock--phone">
        <div className="hx-notif">
          <div className="hx-notif-head">
            <span className="hx-notif-app">Orvius</span>
            <span className="hx-mock-time">now</span>
          </div>
          <p className="hx-notif-title">Emergency · no heat</p>
          <p className="hx-notif-body">
            Dana Ruiz, Barton Hills. Furnace short-cycling, two kids at home. Proposed tomorrow 8–10 AM.
          </p>
          <div className="hx-notif-actions">
            <span>Approve</span>
            <span>Call back</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "confirm",
    title: "Confirms by text",
    body: "The customer gets the window, the tech, and a link to reschedule. No phone tag the next morning.",
    visual: (
      <div className="hx-mock hx-mock--sms">
        <p className="hx-sms hx-sms--in">
          Summit HVAC: You&apos;re booked for tomorrow, 8–10 AM. Marcus will text when he&apos;s on the way.
        </p>
        <p className="hx-sms hx-sms--out">Thank you!! Will the gate code work?</p>
        <p className="hx-sms hx-sms--in">Got it. Gate code added to Marcus&apos;s job notes.</p>
      </div>
    ),
  },
  {
    id: "dispatch",
    title: "Hands the tech the job",
    body: "The assigned tech gets the job on their phone with the address, the notes, and one tap to call the customer.",
    visual: (
      <div className="hx-mock">
        <div className="hx-mock-bar">
          <span>Marcus · today</span>
          <span className="hx-mono">1 of 4</span>
        </div>
        <p className="hx-mock-big hx-mock-big--sm">No heat, furnace</p>
        <p className="hx-mock-sub">8:00 – 10:00 AM · 2214 Barton Hills Dr</p>
        <p className="hx-mock-note">Gate code 4471. Two kids at home.</p>
        <div className="hx-mock-buttons">
          <span className="is-primary">On my way</span>
          <span>Call Dana</span>
          <span>Directions</span>
        </div>
      </div>
    ),
  },
];

const ADVANCE_MS = 6000;

/** Capability list drives the visual beside it; auto-advances until someone picks one. */
export function HomeCapabilities() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0.35,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !visible) return;
    const t = window.setTimeout(() => setActive((i) => (i + 1) % capabilities.length), ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [active, auto, visible]);

  const current = capabilities[active];

  return (
    <section
      ref={sectionRef}
      className="mkt-section mkt-section-dark hx-section hx-caps"
      aria-labelledby="home-caps-heading"
    >
      <div className="editorial-wrap mkt-section-inner">
        <header className="hx-head">
          <p className="mkt-manifesto-kicker font-sans">The night shift</p>
          <h2 id="home-caps-heading" className="hx-title">
            One line that answers, books, and hands off.
          </h2>
        </header>

        <div className="hx-caps-grid">
          <div className="hx-stage" aria-live="polite">
            <div key={current.id} className="hx-stage-inner">
              {current.visual}
            </div>
          </div>

          <ol className="hx-caps-list font-sans">
            {capabilities.map((cap, i) => {
              const isActive = i === active;
              return (
                <li key={cap.id} className={isActive ? "is-active" : undefined}>
                  <button
                    type="button"
                    className="hx-cap"
                    aria-expanded={isActive}
                    aria-controls={`hx-cap-${cap.id}`}
                    onClick={() => {
                      setAuto(false);
                      setActive(i);
                    }}
                  >
                    <span className="hx-cap-index">{String(i + 1).padStart(2, "0")}</span>
                    <span className="hx-cap-title">{cap.title}</span>
                  </button>
                  <div id={`hx-cap-${cap.id}`} className="hx-cap-body" hidden={!isActive}>
                    <p>{cap.body}</p>
                  </div>
                  {isActive && auto && visible ? (
                    <span
                      className="hx-cap-progress"
                      style={{ animationDuration: `${ADVANCE_MS}ms` }}
                      aria-hidden
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
