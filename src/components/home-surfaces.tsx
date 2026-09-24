"use client";

import { useRef } from "react";

type Surface = {
  id: string;
  label: string;
  title: string;
  body: string;
  visual: React.ReactNode;
};

const surfaces: Surface[] = [
  {
    id: "command",
    label: "Command",
    title: "Start the morning with a short list.",
    body: "Overnight calls arrive sorted. Emergencies first, then anything that needs a decision.",
    visual: (
      <div className="hx-shot">
        <div className="hx-shot-bar">
          <span>Queue</span>
          <span className="hx-mono">3</span>
        </div>
        {[
          ["risk", "No heat · Dana Ruiz", "Approve"],
          ["attention", "Water heater leak · K. Osei", "Call back"],
          ["neutral", "Tune-up request · Park Family", "Book"],
        ].map(([tone, what, action]) => (
          <div key={what} className="hx-shot-row">
            <span className={`hx-dot hx-dot--${tone}`} aria-hidden />
            <span className="hx-shot-main">{what}</span>
            <span className="hx-shot-action">{action}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "inbox",
    label: "Inbox",
    title: "Every call is a lead with a summary.",
    body: "Read the call in ten seconds, or play the recording if you want to hear it.",
    visual: (
      <div className="hx-shot">
        <div className="hx-shot-bar">
          <span>Waiting on a callback</span>
        </div>
        {[
          ["11:42 PM", "Dana Ruiz", "No heat"],
          ["10:15 PM", "Kwame Osei", "Leak"],
          ["7:58 PM", "Lena Park", "Tune-up"],
          ["6:30 PM", "R. Alvarez", "Quote"],
        ].map(([when, who, what]) => (
          <div key={who} className="hx-shot-row">
            <span className="hx-mono hx-shot-muted">{when}</span>
            <span className="hx-shot-main">{who}</span>
            <span className="hx-shot-muted">{what}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "jobs",
    label: "Jobs",
    title: "Booked work, with who and when.",
    body: "Status, technician, window, and estimated amount on one row. No second system to keep in sync.",
    visual: (
      <div className="hx-shot">
        <div className="hx-shot-bar">
          <span>Open jobs</span>
          <span className="hx-mono">12</span>
        </div>
        {[
          ["good", "Furnace repair", "Marcus", "8 AM"],
          ["live", "AC diagnostic", "Priya", "Now"],
          ["neutral", "Water heater", "Unassigned", "1 PM"],
        ].map(([tone, job, tech, when]) => (
          <div key={job} className="hx-shot-row">
            <span className={`hx-dot hx-dot--${tone}`} aria-hidden />
            <span className="hx-shot-main">{job}</span>
            <span className="hx-shot-muted">{tech}</span>
            <span className="hx-mono hx-shot-muted">{when}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "tech",
    label: "Tech phone",
    title: "The tech sees one job at a time.",
    body: "A mobile page with no app to install: address, notes, and one tap to call or navigate.",
    visual: (
      <div className="hx-shot hx-shot--phone">
        <p className="hx-shot-kicker">Next · 8:00 AM</p>
        <p className="hx-shot-headline">No heat, furnace</p>
        <p className="hx-shot-muted">2214 Barton Hills Dr</p>
        <div className="hx-mock-buttons hx-mock-buttons--stack">
          <span className="is-primary">On my way</span>
          <span>Call customer</span>
        </div>
      </div>
    ),
  },
  {
    id: "confirm",
    label: "Customer",
    title: "The customer gets a real confirmation.",
    body: "A clean page with the window and the shop's number. Nothing for them to download.",
    visual: (
      <div className="hx-shot hx-shot--phone">
        <p className="hx-shot-kicker">Summit HVAC</p>
        <p className="hx-shot-headline">You&apos;re booked.</p>
        <p className="hx-shot-muted">Tomorrow · 8:00 – 10:00 AM</p>
        <div className="hx-mock-buttons hx-mock-buttons--stack">
          <span>Call the shop</span>
        </div>
      </div>
    ),
  },
];

export function HomeSurfaces() {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>(".hx-surface");
    const step = card ? card.offsetWidth + 16 : track.clientWidth * 0.8;
    track.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section
      className="mkt-section mkt-section-light hx-section hx-surfaces"
      aria-labelledby="home-surfaces-heading"
    >
      <div className="editorial-wrap mkt-section-inner">
        <header className="hx-head hx-head--row" data-reveal>
          <div>
            <p className="mkt-manifesto-kicker font-sans">Inside the product</p>
            <h2 id="home-surfaces-heading" className="hx-title">
              From the call to the driveway.
            </h2>
          </div>
          <div className="hx-arrows">
            <button type="button" aria-label="Previous" onClick={() => scrollBy(-1)}>
              ←
            </button>
            <button type="button" aria-label="Next" onClick={() => scrollBy(1)}>
              →
            </button>
          </div>
        </header>

        <div ref={trackRef} className="hx-track" data-reveal data-reveal-stagger tabIndex={0} aria-label="Product surfaces">
          {surfaces.map((s, i) => (
            <article key={s.id} className="hx-surface" style={{ ["--s" as string]: i }}>
              <div className="hx-surface-visual">{s.visual}</div>
              <p className="hx-surface-label font-sans">{s.label}</p>
              <h3 className="hx-surface-title">{s.title}</h3>
              <p className="hx-surface-body font-sans">{s.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
