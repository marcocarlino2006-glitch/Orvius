"use client";

import { useState, type ReactNode } from "react";

const surfaces = [
  { id: "call", label: "Call" },
  { id: "jobs", label: "Jobs" },
  { id: "dispatch", label: "Dispatch" },
] as const;

type SurfaceId = (typeof surfaces)[number]["id"];

const nav = [
  { id: "overview", label: "Overview" },
  { id: "call", label: "Inbox" },
  { id: "customers", label: "Customers" },
  { id: "jobs", label: "Jobs" },
  { id: "dispatch", label: "Dispatch" },
  { id: "ask", label: "Ask" },
] as const;

export function HomeProductStage() {
  const [surface, setSurface] = useState<SurfaceId>("call");

  return (
    <div className="home-stage">
      <div className="home-stage-tabs" role="tablist" aria-label="Product surfaces">
        {surfaces.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={surface === item.id}
            className={`home-stage-tab font-sans ${
              surface === item.id ? "home-stage-tab-active" : ""
            }`}
            onClick={() => setSurface(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <HomeOsFrame active={surface}>
        {surface === "call" ? <HomeOsCall /> : null}
        {surface === "jobs" ? <HomeOsJobs /> : null}
        {surface === "dispatch" ? <HomeOsDispatch /> : null}
      </HomeOsFrame>
    </div>
  );
}

export function HomeOsFrame({
  active,
  children,
  shop = "Summit HVAC",
}: {
  active: string;
  children: ReactNode;
  shop?: string;
}) {
  return (
    <div className="home-os">
      <div className="home-os-titlebar font-sans">
        <div className="home-os-titlebar-brand">
          <span className="home-os-mark" aria-hidden />
          <span className="home-os-wordmark font-serif">Orvius</span>
          <span className="home-os-shop">{shop}</span>
        </div>
        <span className="home-os-live">
          <span className="home-os-live-dot" />
          Live
        </span>
      </div>
      <div className="home-os-body">
        <aside className="home-os-sidebar" aria-hidden>
          <p className="home-os-sidebar-label">OS</p>
          <nav className="home-os-nav">
            {nav.map((item) => (
              <span
                key={item.id}
                className={`home-os-nav-item ${
                  item.id === active ? "home-os-nav-item-active" : ""
                }`}
              >
                {item.label}
              </span>
            ))}
          </nav>
        </aside>
        <div className="home-os-main">{children}</div>
      </div>
    </div>
  );
}

export function HomeOsCall() {
  return (
    <div className="home-os-call">
      <div className="home-os-panel">
        <p className="home-os-kicker">Inbound · after hours</p>
        <p className="home-os-line">
          <span>Orvius</span> Thanks for calling Summit HVAC. How can I help?
        </p>
        <p className="home-os-line home-os-line-muted">
          <span>Caller</span> My AC stopped cooling. Can someone come today?
        </p>
        <p className="home-os-line">
          <span>Orvius</span> I can help. What&apos;s the address and a callback
          number?
        </p>
        <p className="home-os-foot">
          <span className="home-os-live-dot" />
          Qualified · owner notified
        </p>
      </div>
      <div className="home-os-panel">
        <p className="home-os-kicker home-os-kicker-flare">Owner alert</p>
        <p className="home-os-name font-serif">Maria Lopez</p>
        <dl className="home-os-dl">
          <div>
            <dt>Service</dt>
            <dd>AC not cooling</dd>
          </div>
          <div>
            <dt>Urgency</dt>
            <dd className="home-os-dd-flare">Emergency</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>1842 Oak Street</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd className="tabular-nums">+1 512 555 0123</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export function HomeOsJobs() {
  return (
    <div className="home-os-list">
      <div className="home-os-list-head">
        <p className="home-os-kicker">Today</p>
        <p className="home-os-list-meta">3 booked · 1 emergency</p>
      </div>
      <article className="home-os-row">
        <div>
          <p className="home-os-row-title font-serif">AC not cooling</p>
          <p className="home-os-row-sub">Maria Lopez · 1842 Oak Street</p>
        </div>
        <div className="home-os-row-aside">
          <p className="home-os-row-time">4:00 PM</p>
          <span className="home-os-pill home-os-pill-live">Booked</span>
        </div>
      </article>
      <article className="home-os-row">
        <div>
          <p className="home-os-row-title font-serif">No hot water</p>
          <p className="home-os-row-sub">James Park · 411 Pine</p>
        </div>
        <div className="home-os-row-aside">
          <p className="home-os-row-time">9:30 AM</p>
          <span className="home-os-pill">Confirmed</span>
        </div>
      </article>
      <article className="home-os-row">
        <div>
          <p className="home-os-row-title font-serif">Annual maintenance</p>
          <p className="home-os-row-sub">Oakridge Offices · 2 units</p>
        </div>
        <div className="home-os-row-aside">
          <p className="home-os-row-time">Tue 8:00 AM</p>
          <span className="home-os-pill">Scheduled</span>
        </div>
      </article>
    </div>
  );
}

export function HomeOsDispatch() {
  return (
    <div className="home-os-board">
      <div className="home-os-col">
        <p className="home-os-kicker">Unassigned</p>
        <article className="home-os-chip">
          <p className="home-os-chip-time">2:00 PM</p>
          <p className="home-os-chip-title font-serif">Emergency AC</p>
          <p className="home-os-chip-sub">Maria Lopez</p>
        </article>
      </div>
      <div className="home-os-col">
        <p className="home-os-kicker">Marcus Chen</p>
        <article className="home-os-chip">
          <div className="home-os-chip-head">
            <p className="home-os-chip-time">8:00 AM</p>
            <span className="home-os-pill home-os-pill-live">En route</span>
          </div>
          <p className="home-os-chip-title font-serif">Maintenance</p>
          <p className="home-os-chip-sub">Oakridge Offices</p>
        </article>
      </div>
      <div className="home-os-col">
        <p className="home-os-kicker">Elena Ruiz</p>
        <article className="home-os-chip">
          <div className="home-os-chip-head">
            <p className="home-os-chip-time">9:30 AM</p>
            <span className="home-os-pill home-os-pill-live">On site</span>
          </div>
          <p className="home-os-chip-title font-serif">No hot water</p>
          <p className="home-os-chip-sub">411 Pine</p>
        </article>
      </div>
    </div>
  );
}

export function HomeOsAsk() {
  return (
    <div className="home-os-ask">
      <p className="home-os-kicker">Ask</p>
      <p className="home-os-ask-q font-serif">Who called after hours last night?</p>
      <div className="home-os-ask-a">
        <p>
          Maria Lopez. Emergency AC, 1842 Oak Street. Captured at 9:14 PM.
          Owner alerted. Not yet assigned.
        </p>
        <p className="home-os-ask-source">From OS memory · Inbox + Jobs</p>
      </div>
    </div>
  );
}
