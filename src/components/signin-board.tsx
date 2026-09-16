"use client";

import { useEffect, useState } from "react";

type Entry = {
  id: string;
  at: string;
  shop: string;
  line: string;
  detail: string;
  tag: "INTAKE" | "BOOKED" | "ALERT" | "CONFIRM";
};

/**
 * A rolling dispatch feed for the sign-in canvas.
 *
 * These are illustrative rows, labelled as such, on a fixed rotation — the
 * sign-in page is unauthenticated, so it has no tenant and nothing real to
 * read. The rotation is index-driven rather than clock-driven so the server and
 * the first client render agree and hydration stays quiet.
 */
const FEED: Entry[] = [
  {
    id: "a",
    at: "23:41",
    shop: "Summit HVAC",
    line: "AC not cooling · Oak St",
    detail: "Service, urgency, address, and callback captured.",
    tag: "INTAKE",
  },
  {
    id: "b",
    at: "23:42",
    shop: "Summit HVAC",
    line: "Window proposed · today 4–6 PM",
    detail: "Checked against open capacity before it was offered.",
    tag: "BOOKED",
  },
  {
    id: "c",
    at: "23:42",
    shop: "Summit HVAC",
    line: "Owner alerted · SMS",
    detail: "Delivery accepted by carrier, logged against the record.",
    tag: "ALERT",
  },
  {
    id: "d",
    at: "01:07",
    shop: "Ridgeline Plumbing",
    line: "No hot water · Pine Ave",
    detail: "After-hours intake, callback number read back and confirmed.",
    tag: "INTAKE",
  },
  {
    id: "e",
    at: "01:09",
    shop: "Ridgeline Plumbing",
    line: "Customer confirmed by text",
    detail: "Reply logged on the job; no price or arrival time quoted.",
    tag: "CONFIRM",
  },
  {
    id: "f",
    at: "05:12",
    shop: "Vale Electric",
    line: "Panel fault · Beckett Rd",
    detail: "Escalated to the on-call technician before the shop opened.",
    tag: "ALERT",
  },
];

const ROTATE_MS = 2600;
const VISIBLE = 5;

export function SignInBoard() {
  const [cursor, setCursor] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(
      () => setCursor((n) => (n + 1) % FEED.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(timer);
  }, [reduced]);

  const rows = Array.from({ length: VISIBLE }, (_, i) => FEED[(cursor + i) % FEED.length]);

  return (
    <div className="ov-signin-board" aria-hidden>
      <div className="ov-signin-board-head">
        <span className="ov-signin-board-title">Dispatch activity</span>
        <span className="ov-status-pill ov-status-pill--operational">
          <span className="ov-status-dot" />
          LIVE
        </span>
      </div>

      <ul className="ov-signin-feed">
        {rows.map((entry, i) => (
          // Keying on position plus id restarts the entry animation as the feed
          // advances, which is what makes a row read as newly arrived.
          <li
            key={`${entry.id}-${cursor}-${i}`}
            className={`ov-signin-row ${i === 0 ? "is-newest" : ""}`.trim()}
          >
            <span className="ov-signin-row-time">{entry.at}</span>
            <span className={`ov-signin-row-tag ov-signin-row-tag--${entry.tag.toLowerCase()}`}>
              {entry.tag}
            </span>
            <span className="ov-signin-row-body">
              <span className="ov-signin-row-line">{entry.line}</span>
              <span className="ov-signin-row-detail">{entry.detail}</span>
            </span>
            <span className="ov-signin-row-shop">{entry.shop}</span>
          </li>
        ))}
      </ul>

      <p className="ov-signin-board-foot">
        Illustrative activity from labeled reference shops — not customer data.
      </p>
    </div>
  );
}
