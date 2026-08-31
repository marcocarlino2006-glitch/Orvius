"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { OrviusLogo } from "@/components/orvius-logo";

const surfaces = [
  { id: "call", label: "Call", path: "orvius.im/inbox" },
  { id: "jobs", label: "Jobs", path: "orvius.im/jobs" },
  { id: "dispatch", label: "Dispatch", path: "orvius.im/dispatch" },
  { id: "ask", label: "Ask", path: "orvius.im/ask" },
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

const rail = [
  {
    group: "After hours",
    surface: "call" as const,
    items: [
      { id: "maria", title: "Emergency AC", meta: "Maria Lopez · 9:14 PM" },
      { id: "james", title: "No hot water", meta: "James Park · 6:41 AM" },
    ],
  },
  {
    group: "Today",
    surface: "jobs" as const,
    items: [
      { id: "oak", title: "Annual maintenance", meta: "Oakridge · 8:00 AM" },
      { id: "pine", title: "No hot water", meta: "411 Pine · 9:30 AM" },
    ],
  },
  {
    group: "Crew",
    surface: "dispatch" as const,
    items: [
      { id: "marcus", title: "Marcus Chen", meta: "En route · Oakridge" },
      { id: "elena", title: "Elena Ruiz", meta: "On site · 411 Pine" },
    ],
  },
] as const;

export function HomeProductStage() {
  const [surface, setSurface] = useState<SurfaceId>("call");
  const current = surfaces.find((item) => item.id === surface) ?? surfaces[0];

  return (
    <div className="home-stage tier-stage">
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

      <div className="home-os home-os-hero">
        <div className="home-os-chrome font-sans">
          <span className="home-os-chrome-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="home-os-url">{current.path}</span>
          <span className="home-os-live">
            <span className="home-os-live-dot" />
            Preview
          </span>
        </div>

        <div className="home-os-titlebar font-sans">
          <div className="home-os-titlebar-brand">
            <OrviusLogo size="sm" variant="chalk" markOnly />
            <span className="home-os-wordmark font-sans">Orvius</span>
            <span className="home-os-shop">Summit HVAC</span>
          </div>
          <span className="home-os-shop-meta">RING 04 · FIELD</span>
        </div>

        <div className="home-os-workspace">
          <aside className="home-os-rail" aria-label="Shop activity">
            {rail.map((section) => (
              <div key={section.group} className="home-os-rail-group">
                <p className="home-os-kicker">{section.group}</p>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`home-os-rail-item ${
                      surface === section.surface ? "home-os-rail-item-active" : ""
                    }`}
                    onClick={() => setSurface(section.surface)}
                  >
                    <span className="home-os-rail-title">{item.title}</span>
                    <span className="home-os-rail-meta">{item.meta}</span>
                  </button>
                ))}
              </div>
            ))}
          </aside>

          <div className="home-os-workspace-main">
            <div className="home-os-body home-os-body-hero">
              <aside className="home-os-sidebar" aria-hidden>
                <p className="home-os-sidebar-label">OS</p>
                <nav className="home-os-nav">
                  {nav.map((item) => (
                    <span
                      key={item.id}
                      className={`home-os-nav-item ${
                        item.id === surface ? "home-os-nav-item-active" : ""
                      }`}
                    >
                      {item.label}
                    </span>
                  ))}
                </nav>
              </aside>
              <div className="home-os-main">
                {surface === "call" ? <HomeOsCall dense /> : null}
                {surface === "jobs" ? <HomeOsJobs dense /> : null}
                {surface === "dispatch" ? <HomeOsDispatch dense /> : null}
                {surface === "ask" ? <HomeOsAsk dense /> : null}
              </div>
            </div>

            <div className="home-os-composer font-sans">
              <p className="home-os-composer-label">Ask</p>
              <p className="home-os-composer-placeholder">
                Who is free for the Oakridge emergency?
              </p>
              <Link href="/login" className="home-os-composer-btn">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
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
          <OrviusLogo size="sm" variant="chalk" markOnly />
          <span className="home-os-wordmark font-sans">Orvius</span>
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

export function HomeOsCall({ dense = false }: { dense?: boolean }) {
  return (
    <div className="home-os-call">
      <div className="home-os-panel">
        <div className="home-os-panel-head">
          <p className="home-os-kicker">Inbound · after hours</p>
          <p className="home-os-list-meta">2m 14s · 4 fields</p>
        </div>
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
        {dense ? (
          <>
            <p className="home-os-line home-os-line-muted">
              <span>Caller</span> 1842 Oak Street. 512-555-0123.
            </p>
            <p className="home-os-line">
              <span>Orvius</span> Treating this as an emergency. I&apos;m notifying
              the owner now.
            </p>
          </>
        ) : null}
        <p className="home-os-foot">
          <span className="home-os-live-dot" />
          Qualified · owner SMS sent
        </p>
      </div>
      <div className="home-os-panel">
        <p className="home-os-kicker home-os-kicker-flare">Owner alert</p>
        <p className="home-os-name font-sans">Maria Lopez</p>
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
        {dense ? (
          <p className="home-os-note">
            Captured while the owner was on a job. Not yet assigned — Marcus Chen
            is closest.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function HomeOsJobs({ dense = false }: { dense?: boolean }) {
  return (
    <div className="home-os-list">
      <div className="home-os-list-head">
        <p className="home-os-kicker">Today</p>
        <p className="home-os-list-meta">
          {dense ? "4 booked · 1 emergency · 2 techs" : "3 booked · 1 emergency"}
        </p>
      </div>
      <article className="home-os-row">
        <div>
          <p className="home-os-row-title font-sans">AC not cooling</p>
          <p className="home-os-row-sub">Maria Lopez · 1842 Oak Street</p>
        </div>
        <div className="home-os-row-aside">
          <p className="home-os-row-time">4:00 PM</p>
          <span className="home-os-pill home-os-pill-live">Booked</span>
        </div>
      </article>
      <article className="home-os-row">
        <div>
          <p className="home-os-row-title font-sans">No hot water</p>
          <p className="home-os-row-sub">James Park · 411 Pine · Elena Ruiz</p>
        </div>
        <div className="home-os-row-aside">
          <p className="home-os-row-time">9:30 AM</p>
          <span className="home-os-pill home-os-pill-live">On site</span>
        </div>
      </article>
      <article className="home-os-row">
        <div>
          <p className="home-os-row-title font-sans">Annual maintenance</p>
          <p className="home-os-row-sub">Oakridge Offices · 2 units · Marcus Chen</p>
        </div>
        <div className="home-os-row-aside">
          <p className="home-os-row-time">8:00 AM</p>
          <span className="home-os-pill home-os-pill-live">En route</span>
        </div>
      </article>
      {dense ? (
        <article className="home-os-row">
          <div>
            <p className="home-os-row-title font-sans">Filter change</p>
            <p className="home-os-row-sub">Returning · 902 Maple · unassigned</p>
          </div>
          <div className="home-os-row-aside">
            <p className="home-os-row-time">Tue 11:00 AM</p>
            <span className="home-os-pill">Scheduled</span>
          </div>
        </article>
      ) : null}
    </div>
  );
}

export function HomeOsDispatch({ dense = false }: { dense?: boolean }) {
  return (
    <div className="home-os-board">
      <div className="home-os-col">
        <p className="home-os-kicker">Unassigned · 1</p>
        <article className="home-os-chip">
          <p className="home-os-chip-time">2:00 PM</p>
          <p className="home-os-chip-title font-sans">Emergency AC</p>
          <p className="home-os-chip-sub">Maria Lopez · Oak Street</p>
        </article>
      </div>
      <div className="home-os-col">
        <p className="home-os-kicker">Marcus Chen</p>
        <article className="home-os-chip">
          <div className="home-os-chip-head">
            <p className="home-os-chip-time">8:00 AM</p>
            <span className="home-os-pill home-os-pill-live">En route</span>
          </div>
          <p className="home-os-chip-title font-sans">Maintenance</p>
          <p className="home-os-chip-sub">Oakridge Offices</p>
        </article>
        {dense ? (
          <article className="home-os-chip">
            <p className="home-os-chip-time">1:00 PM</p>
            <p className="home-os-chip-title font-sans">Filter change</p>
            <p className="home-os-chip-sub">902 Maple</p>
          </article>
        ) : null}
      </div>
      <div className="home-os-col">
        <p className="home-os-kicker">Elena Ruiz</p>
        <article className="home-os-chip">
          <div className="home-os-chip-head">
            <p className="home-os-chip-time">9:30 AM</p>
            <span className="home-os-pill home-os-pill-live">On site</span>
          </div>
          <p className="home-os-chip-title font-sans">No hot water</p>
          <p className="home-os-chip-sub">411 Pine</p>
        </article>
      </div>
    </div>
  );
}

export function HomeOsAsk({ dense = false }: { dense?: boolean }) {
  return (
    <div className="home-os-ask">
      <p className="home-os-kicker">Ask · from OS memory</p>
      <p className="home-os-ask-q font-sans">Who called after hours last night?</p>
      <div className="home-os-ask-a">
        <p>
          Maria Lopez. Emergency AC, 1842 Oak Street. Captured at 9:14 PM.
          Owner alerted. Not yet assigned — Marcus Chen is closest after Oakridge.
        </p>
        <p className="home-os-ask-source">Inbox · Jobs · Dispatch</p>
      </div>
      {dense ? (
        <>
          <p className="home-os-ask-q home-os-ask-q-follow font-sans">
            Put her on Marcus after Oakridge.
          </p>
          <div className="home-os-ask-a">
            <p>
              Drafted: Emergency AC assigned to Marcus Chen at 2:00 PM, after
              Oakridge maintenance. Confirm in dispatch to make it live.
            </p>
            <p className="home-os-ask-source">Field · not yet written</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
