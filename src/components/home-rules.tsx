"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Rule = {
  id: string;
  title: string;
  body: string;
  src: string;
  /** Zoom focus inside the screenshot, as CSS transform-origin percentages. */
  focus: string;
  zoom: number;
};

const rules: Rule[] = [
  {
    id: "greeting",
    title: "Your opening line",
    body: "The first thing every caller hears, in your words and your shop's name.",
    src: "/marketing/product/s-receptionist.webp",
    focus: "right 14%",
    zoom: 1.36,
  },
  {
    id: "routine",
    title: "What runs on its own",
    body: "Confirms upcoming appointments by text and assigns the obvious technician. Ties, emergencies, and safety calls still come to you.",
    src: "/marketing/product/s-receptionist.webp",
    focus: "right 48%",
    zoom: 1.36,
  },
  {
    id: "area",
    title: "Your hours and area",
    body: "Set when you're open, the work you take, and the ZIPs you serve. Leads outside your area stay on the board instead of booking.",
    src: "/marketing/product/s-zips.webp",
    focus: "right bottom",
    zoom: 1.36,
  },
  {
    id: "crew",
    title: "Your crew",
    body: "Add your technicians once. Jobs are assigned to them and land on their phones with the address and notes.",
    src: "/marketing/product/s-team.webp",
    focus: "right top",
    zoom: 1.36,
  },
];

const ADVANCE_MS = 6500;

export function HomeRules() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

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
    const t = window.setTimeout(() => setActive((i) => (i + 1) % rules.length), ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [active, auto, visible]);

  const current = rules[active];
  const images = [...new Set(rules.map((r) => r.src))];

  return (
    <section ref={sectionRef} className="hx-section hx-rules" aria-labelledby="home-rules-heading">
      <div className="editorial-wrap mkt-section-inner">
        <header className="hx-head" data-reveal>
          <p className="mkt-manifesto-kicker font-sans">Your rules</p>
          <h2 id="home-rules-heading" className="hx-title">
            It answers the way you would.
          </h2>
        </header>

        <div className="hx-rules-grid" data-reveal>
          <div className="hx-stage">
            {images.map((src) => {
              const on = src === current.src;
              return (
                <div
                  key={src}
                  className={`hx-stage-shot${on ? " is-on" : ""}`}
                  style={
                    on
                      ? { transformOrigin: current.focus, transform: `scale(${current.zoom})` }
                      : undefined
                  }
                >
                  <Image
                    src={src}
                    alt=""
                    width={1200}
                    height={890}
                    sizes="(max-width: 900px) 92vw, 640px"
                  />
                </div>
              );
            })}
            <p className="sr-only" aria-live="polite">
              Settings: {current.title}
            </p>
          </div>

          <ol className="hx-caps-list font-sans">
            {rules.map((rule, i) => {
              const isActive = i === active;
              return (
                <li key={rule.id} className={isActive ? "is-active" : undefined}>
                  <button
                    type="button"
                    className="hx-cap"
                    aria-expanded={isActive}
                    aria-controls={`hx-rule-${rule.id}`}
                    onClick={() => {
                      setAuto(false);
                      setActive(i);
                    }}
                  >
                    <span className="hx-cap-index">{String(i + 1).padStart(2, "0")}</span>
                    <span className="hx-cap-title">{rule.title}</span>
                  </button>
                  <div id={`hx-rule-${rule.id}`} className="hx-cap-body" hidden={!isActive}>
                    <p>{rule.body}</p>
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
