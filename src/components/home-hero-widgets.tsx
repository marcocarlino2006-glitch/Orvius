"use client";

import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

export function HomeHeroWidgets() {
  const now = new Date().toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="home-hero-widgets" aria-label="Product preview">
      <article className="home-widget home-widget-live">
        <header className="home-widget-head font-sans">
          <span className="home-widget-live-label">
            <span className="call-demo-pulse" aria-hidden />
            Live call
          </span>
          <time>{now}</time>
        </header>
        <a href={demoLineHref()} className="home-widget-phone font-sans">
          {DEMO_LINE_DISPLAY}
        </a>
        <p className="home-widget-meta font-sans">Answered in 1.8s</p>
        <blockquote className="home-widget-quote font-sans">
          &ldquo;Hi, thanks for calling Summit HVAC! How can I help you today?&rdquo;
        </blockquote>
      </article>

      <article className="home-widget home-widget-stat">
        <p className="home-widget-kicker font-sans">Recovered today</p>
        <p className="home-widget-stat-value home-widget-stat-live font-serif">+$1,240</p>
        <p className="home-widget-stat-sub font-sans">4 jobs booked</p>
      </article>

      <article className="home-widget home-widget-stat">
        <p className="home-widget-kicker font-sans">Answer time</p>
        <p className="home-widget-stat-value home-widget-stat-signal font-serif">1.8s</p>
        <p className="home-widget-stat-sub font-sans">Every call, 24/7</p>
      </article>
    </div>
  );
}
