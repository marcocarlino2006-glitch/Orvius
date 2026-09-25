import Link from "next/link";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

const cards = [
  {
    href: "/pilot",
    kicker: "Call audit",
    title: "See the calls you're missing",
    body: "A live look at your after-hours and overflow pattern, then we set up your shop line.",
    cta: "Request an audit",
  },
  {
    href: "/product",
    kicker: "Product",
    title: "Tour the operating board",
    body: "Command, Inbox, Jobs, and the tech phone page, one surface at a time.",
    cta: "See the product",
  },
  {
    href: "/pricing",
    kicker: "Pricing",
    title: "Plans for one truck or forty",
    body: "Line, Pro, and Enterprise. Start on the line and add seats as the shop grows.",
    cta: "Compare plans",
  },
  {
    href: "/security",
    kicker: "Trust",
    title: "Recordings, data, and consent",
    body: "How call data is handled, and what your shop controls around recording and SMS.",
    cta: "Read security",
  },
] as const;

export function HomeStart() {
  return (
    <section
      className="mkt-section mkt-section-light hx-section hx-start"
      aria-labelledby="home-start-heading"
    >
      <div className="editorial-wrap mkt-section-inner">
        <header className="hx-head" data-reveal>
          <p className="mkt-manifesto-kicker font-sans">Start here</p>
          <h2 id="home-start-heading" className="hx-title">
            Pick the path that fits your shop.
          </h2>
        </header>

        <div className="hx-start-grid font-sans" data-reveal data-reveal-stagger>
          <a href={demoLineHref()} className="hx-card hx-card--feature">
            <span className="hx-card-kicker">Live line</span>
            <span className="hx-card-title">Call it right now</span>
            <span className="hx-card-body">
              Pretend you have a broken furnace. The night shift answers, qualifies, and proposes a
              window.
            </span>
            <span className="hx-card-number hx-mono">{DEMO_LINE_DISPLAY}</span>
          </a>
          {cards.map((c, i) => (
            <Link
              key={c.href}
              href={c.href}
              className="hx-card"
              style={{ ["--s" as string]: i + 1 }}
            >
              <span className="hx-card-kicker">{c.kicker}</span>
              <span className="hx-card-title">{c.title}</span>
              <span className="hx-card-body">{c.body}</span>
              <span className="hx-card-cta">
                {c.cta} <span aria-hidden>→</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
