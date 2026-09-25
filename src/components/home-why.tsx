"use client";

import { useEffect, useRef } from "react";
import { company } from "@/lib/company";

const MANIFESTO =
  "Most trade shops don't lose work to a better competitor. They lose it to voicemail. A furnace dies at night, the owner is asleep, and the caller dials the next number on the list. We built Orvius so that call gets answered, understood, and booked, and so the owner wakes up to a short list instead of a missed-call log.";

const chapters = [
  {
    kicker: "The problem",
    title: "Calls come when nobody can take them.",
    body: "After hours, at lunch, when every tech is on a job. Answering services take a message, and someone still has to call back in the morning.",
  },
  {
    kicker: "What we believe",
    title: "The call is the start of the job.",
    body: "Intake, booking, the customer's confirmation, and the tech's phone should all run from one record, not a message that gets retyped.",
  },
  {
    kicker: "How we build",
    title: "One trade first, done properly.",
    body: "We started with HVAC on overflow and after-hours. We use replaceable AI models and own the workflow, data, and actions around them.",
  },
] as const;

function LineArt() {
  return (
    <svg className="hx-lineart" viewBox="0 0 420 220" fill="none" aria-hidden>
      <path className="hx-draw hx-draw--muted" pathLength={1} d="M20 176 H400" />
      <path
        className="hx-draw"
        pathLength={1}
        d="M48 176 V104 L118 54 L188 104 V176"
        style={{ ["--d" as string]: "80ms" }}
      />
      <path
        className="hx-draw hx-draw--muted"
        pathLength={1}
        d="M100 176 V132 H132 V176"
        style={{ ["--d" as string]: "300ms" }}
      />
      <path
        className="hx-draw hx-draw--lit"
        pathLength={1}
        d="M146 116 H168 V138 H146 Z"
        style={{ ["--d" as string]: "420ms" }}
      />
      <path
        className="hx-draw hx-draw--muted"
        pathLength={1}
        d="M70 30 A16 16 0 1 0 92 52 A12 12 0 1 1 70 30 Z"
        style={{ ["--d" as string]: "520ms" }}
      />
      <path
        className="hx-draw hx-draw--lit"
        pathLength={1}
        d="M204 92 Q224 78 244 92 M200 72 Q228 50 256 72 M196 52 Q232 22 268 52"
        style={{ ["--d" as string]: "700ms" }}
      />
      <path
        className="hx-draw"
        pathLength={1}
        d="M312 40 H356 A8 8 0 0 1 364 48 V160 A8 8 0 0 1 356 168 H312 A8 8 0 0 1 304 160 V48 A8 8 0 0 1 312 40 Z M324 152 H344"
        style={{ ["--d" as string]: "880ms" }}
      />
      <path
        className="hx-draw hx-draw--lit"
        pathLength={1}
        d="M316 70 H352 M316 86 H344 M316 102 H348"
        style={{ ["--d" as string]: "1100ms" }}
      />
      {[
        [48, 104],
        [118, 54],
        [188, 104],
        [304, 48],
        [364, 160],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          className="hx-node"
          cx={cx}
          cy={cy}
          r={3}
          style={{ ["--d" as string]: `${600 + i * 90}ms` }}
        />
      ))}
    </svg>
  );
}

/** Scroll-lit manifesto: each word's opacity follows scroll progress through the paragraph. */
function ScrollLitText({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--p", "1");
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh * 0.85;
      const end = vh * 0.35;
      const p = (start - rect.top) / (start - end + rect.height);
      el.style.setProperty("--p", String(Math.min(1, Math.max(0, p))));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <p ref={ref} className="hx-lit" style={{ ["--n" as string]: words.length }}>
      {words.map((w, i) => (
        <span key={i} style={{ ["--i" as string]: i }}>
          {w}{" "}
        </span>
      ))}
    </p>
  );
}

export function HomeWhy() {
  return (
    <section className="hx-section hx-why" aria-labelledby="home-why-heading">
      <div className="editorial-wrap mkt-section-inner">
        <div className="hx-why-panel" data-reveal>
          <LineArt />
          <p className="hx-why-kicker font-sans">Why we built Orvius</p>
          <h2 id="home-why-heading" className="hx-why-title">
            The phone rings at 11:42 PM.
            <span> Nobody picks up.</span>
          </h2>
        </div>

        <div className="hx-why-body">
          <ScrollLitText text={MANIFESTO} />
        </div>

        <div className="hx-chapters font-sans" data-reveal data-reveal-stagger>
          {chapters.map((c, i) => (
            <article key={c.kicker} className="hx-chapter" style={{ ["--s" as string]: i }}>
              <p className="hx-chapter-kicker">
                <span className="hx-mono">{String(i + 1).padStart(2, "0")}</span> {c.kicker}
              </p>
              <h3 className="hx-chapter-title">{c.title}</h3>
              <p className="hx-chapter-body">{c.body}</p>
            </article>
          ))}
        </div>

        <p className="hx-signoff font-sans" data-reveal>
          {company.legalName} · Founded {company.foundedYear}
        </p>
      </div>
    </section>
  );
}
