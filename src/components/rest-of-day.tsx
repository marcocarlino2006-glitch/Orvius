"use client";

import { useEffect, useState, type ReactNode } from "react";

const KEY = "orvius-home-rest-open";

/**
 * Everything on Home that is not the sentence or the one thing happening.
 * It stays one line until opened, and remembers how the owner left it.
 */
export function RestOfDay({ summary, startOpen, children }: { summary: string; startOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(startOpen);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "1") setOpen(true);
    else if (saved === "0") setOpen(false);
    if (window.location.hash === "#the-day") setOpen(true);
  }, []);

  function toggle() {
    setOpen((current) => {
      window.localStorage.setItem(KEY, current ? "0" : "1");
      return !current;
    });
  }

  return (
    <section className="cmd-rest" aria-label="The rest of today">
      <button type="button" className="cmd-rest-toggle" aria-expanded={open} aria-controls="the-day" onClick={toggle}>
        <span className="cmd-rest-title">The rest of today</span>
        <span className="cmd-rest-summary">{summary}</span>
        <span className="cmd-rest-chevron" aria-hidden>
          {open ? "Hide" : "Show"}
        </span>
      </button>
      <div id="the-day" className="cmd-day-board" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
