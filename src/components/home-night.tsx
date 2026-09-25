"use client";

import { useEffect, useRef, useState } from "react";

type Step = {
  time: string;
  title: string;
  body: string;
  status: string;
  tone: "live" | "attention" | "good";
  log: string;
};

const steps: Step[] = [
  {
    time: "11:42 PM",
    title: "The call",
    body: "Dana's furnace is short-cycling. Two kids at home, 58°F inside. The line picks up in Summit HVAC's name.",
    status: "On the line",
    tone: "live",
    log: "Call answered · after-hours line",
  },
  {
    time: "11:43 PM",
    title: "The intake",
    body: "Issue, address, equipment, and urgency. Every answer is written to her customer record as she says it.",
    status: "Qualified",
    tone: "attention",
    log: "No heat · gas furnace · emergency",
  },
  {
    time: "11:44 PM",
    title: "The window",
    body: "It offers openings from tomorrow's schedule. Dana picks 8 to 10 AM and the slot is held.",
    status: "Window held",
    tone: "attention",
    log: "Proposed tomorrow 8–10 AM",
  },
  {
    time: "11:45 PM",
    title: "The owner",
    body: "Flagged as an emergency, so the owner gets an alert with the summary already written. One tap approves it.",
    status: "Approved",
    tone: "good",
    log: "Owner alerted · approved",
  },
  {
    time: "11:46 PM",
    title: "The text",
    body: "Dana gets a confirmation with the window and the tech's name. No phone tag in the morning.",
    status: "Confirmed",
    tone: "good",
    log: "Confirmation texted to Dana",
  },
  {
    time: "7:52 AM",
    title: "The driveway",
    body: "Marcus opens the job on his phone, taps On my way, and Dana gets the heads-up.",
    status: "En route",
    tone: "live",
    log: "Marcus on the way",
  },
];

function RecordVisual({ active }: { active: number }) {
  const step = steps[active];
  return (
    <div className="hx-record" aria-hidden>
      <div className="hx-record-clock">
        <span key={step.time} className="hx-record-time hx-mono">
          {step.time}
        </span>
        <span className="hx-record-track">
          <span style={{ transform: `scaleX(${(active + 1) / steps.length})` }} />
        </span>
      </div>
      <div className="hx-record-card">
        <div className="hx-record-head">
          <span className="hx-record-avatar">DR</span>
          <div>
            <p className="hx-record-name">Dana Ruiz</p>
            <p className="hx-record-sub">2214 Barton Hills Dr</p>
          </div>
          <span key={step.status} className={`hx-record-status is-${step.tone}`}>
            <span className={`hx-dot hx-dot--${step.tone}`} />
            {step.status}
          </span>
        </div>
        <ol className="hx-record-log">
          {steps.map((s, i) => (
            <li key={s.time} className={i <= active ? "is-on" : undefined}>
              <span className="hx-mono">{s.time}</span>
              <span>{s.log}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function HomeNight() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <section className="hx-section hx-night" aria-labelledby="home-night-heading">
      <div className="editorial-wrap mkt-section-inner">
        <header className="hx-head" data-reveal>
          <p className="mkt-manifesto-kicker font-sans">A night on the line</p>
          <h2 id="home-night-heading" className="hx-title">
            One call, from 11:42 PM to the driveway.
          </h2>
        </header>

        <div className="hx-night-grid">
          <ol className="hx-night-steps font-sans">
            {steps.map((s, i) => (
              <li
                key={s.time}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                data-step={i}
                className={i === active ? "is-active" : i < active ? "is-past" : undefined}
              >
                <p className="hx-night-time hx-mono">{s.time}</p>
                <h3 className="hx-night-title">{s.title}</h3>
                <p className="hx-night-body">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="hx-night-stage">
            <RecordVisual active={active} />
          </div>
        </div>
      </div>
    </section>
  );
}
