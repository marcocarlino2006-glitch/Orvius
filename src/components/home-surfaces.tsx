"use client";

import Image from "next/image";
import { useRef } from "react";

type Surface = {
  id: string;
  label: string;
  title: string;
  body: string;
};

const desktop: (Surface & { src: string })[] = [
  {
    id: "command",
    label: "Command",
    title: "Start the morning with a short list.",
    body: "Overnight calls arrive sorted, each with the dollar value at stake and the one thing to do next.",
    src: "/marketing/product/command.webp",
  },
  {
    id: "calls",
    label: "Calls",
    title: "Every call graded, the rough ones flagged.",
    body: "See which calls went cleanly and which are worth a listen, with the reason written out.",
    src: "/marketing/product/calls.webp",
  },
  {
    id: "inbox",
    label: "Inbox",
    title: "Every caller becomes a lead with a summary.",
    body: "What they need, where they are, and whether it's booked, without playing a single voicemail.",
    src: "/marketing/product/inbox.webp",
  },
  {
    id: "jobs",
    label: "Jobs",
    title: "Booked work, with who, when, and how much.",
    body: "Status, technician, window, and estimate on one row. No second system to keep in sync.",
    src: "/marketing/product/jobs.webp",
  },
];

const field: Surface = {
  id: "field",
  label: "In the field",
  title: "The tech and the customer each get one clean page.",
  body: "No app to install. The tech gets the address and one tap to call; the customer gets the window and the shop's number.",
};

export function HomeSurfaces() {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>(".hx-surface");
    const step = card ? card.offsetWidth + 20 : track.clientWidth * 0.8;
    track.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  return (
    <section className="hx-section hx-surfaces" aria-labelledby="home-surfaces-heading">
      <div className="editorial-wrap mkt-section-inner">
        <header className="hx-head hx-head--row" data-reveal>
          <div>
            <p className="mkt-manifesto-kicker font-sans">Inside the product</p>
            <h2 id="home-surfaces-heading" className="hx-title">
              The board your shop runs on.
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
      </div>

      <div
        ref={trackRef}
        className="hx-track"
        data-reveal
        tabIndex={0}
        aria-label="Product screens"
      >
        {desktop.map((s) => (
          <article key={s.id} className="hx-surface">
            <div className="hx-surface-visual">
              <Image
                src={s.src}
                alt={`Orvius ${s.label} screen`}
                width={1600}
                height={1000}
                sizes="(max-width: 560px) 86vw, 46rem"
              />
            </div>
            <p className="hx-surface-label font-sans">{s.label}</p>
            <h3 className="hx-surface-title">{s.title}</h3>
            <p className="hx-surface-body font-sans">{s.body}</p>
          </article>
        ))}
        <article className="hx-surface hx-surface--field">
          <div className="hx-surface-visual hx-surface-visual--phones">
            <Image
              src="/marketing/product/tech.webp"
              alt="Technician job page on a phone"
              width={640}
              height={1385}
              sizes="10rem"
            />
            <Image
              src="/marketing/product/confirm.webp"
              alt="Customer confirmation page on a phone"
              width={640}
              height={1385}
              sizes="10rem"
            />
          </div>
          <p className="hx-surface-label font-sans">{field.label}</p>
          <h3 className="hx-surface-title">{field.title}</h3>
          <p className="hx-surface-body font-sans">{field.body}</p>
        </article>
      </div>
    </section>
  );
}
