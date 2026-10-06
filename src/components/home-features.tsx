import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BoardDemo, CallsDemo, PhonesDemo, ReceptionistDemo } from "@/components/home-demos";
import { CHANGELOG } from "@/lib/changelog";

type Feature = {
  id: string;
  title: string;
  body: string;
  link: { href: string; label: string };
  art: string;
  demo: ReactNode;
  phones?: boolean;
};

const features: Feature[] = [
  {
    id: "receptionist",
    title: "The receptionist brings in the work.",
    body: "Calls answered in your name, with your opening line, voice and hours. Gas, smoke and medical emergencies get safety steps first, then you.",
    link: { href: "/product", label: "See how the receptionist works" },
    art: "/marketing/art/dusk.webp",
    demo: <ReceptionistDemo />,
  },
  {
    id: "command",
    title: "Command schedules it.",
    body: "Each job lands on your real calendar with someone free who has the skill. What still needs you is a short list, each with the dollar value at stake and the one thing to do next.",
    link: { href: "/product", label: "Explore the board" },
    art: "/marketing/art/dawn.webp",
    demo: <BoardDemo />,
  },
  {
    id: "field",
    title: "Your people and customers, coordinated.",
    body: "Whoever is going gets the address and one tap to call. The customer gets the time with one tap to confirm, and callers nobody reached get a follow-up. No app to install.",
    link: { href: "/help", label: "Read the help center" },
    art: "/marketing/art/morning.webp",
    demo: <PhonesDemo />,
    phones: true,
  },
  {
    id: "calls",
    title: "What actually happened, on the record.",
    body: "Every call recorded, transcribed and graded. Every booking, text and change is in the activity log, and each week shows calls answered, jobs booked and money collected.",
    link: { href: "/pilot", label: "Get a free call audit" },
    art: "/marketing/art/night.webp",
    demo: <CallsDemo />,
  },
];

const industries = [
  { name: "Home services", detail: "HVAC, plumbing, electrical, roofing, garage doors, appliance repair" },
  { name: "On-site services", detail: "Pest control, cleaning, moving, locksmiths" },
  { name: "Beauty", detail: "Salons and spas" },
  { name: "Professional", detail: "Law offices and real estate" },
  { name: "Auto", detail: "Repair shops and service bays" },
];

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * One idea per row: a short heading, one sentence, one link, and the real
 * screen set on a painted backdrop. Rows alternate sides on wide screens.
 */
export function HomeFeatures() {
  return (
    <>
      <section className="hf-section" aria-label="What Orvius does">
        <div className="hf-wrap">
          {features.map((f, i) => (
            <article key={f.id} id={f.id} className={`hf-row ${i % 2 ? "hf-row--flip" : ""}`} data-reveal>
              <div className="hf-copy">
                <h2 className="hf-title">{f.title}</h2>
                <p className="hf-body font-sans">{f.body}</p>
                <Link href={f.link.href} className="hf-link font-sans">
                  {f.link.label} <Arrow />
                </Link>
              </div>
              <div className={`hf-art ${f.phones ? "hf-art--phones" : ""}`}>
                <Image src={f.art} alt="" fill sizes="(max-width: 900px) 100vw, 60vw" className="hf-art-bg" />
                {f.demo}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="industries" className="hf-section hf-industries" aria-labelledby="home-industries-heading">
        <div className="hf-wrap">
          <header className="hf-industries-head" data-reveal>
            <h2 id="home-industries-heading" className="hf-title">
              Built for every business that runs on the phone.
            </h2>
            <p className="hf-body font-sans">
              Pick your business type and it asks the right questions. Field businesses get an address and a window;
              offices get an appointment, never a home address.
            </p>
          </header>
          <ul className="hf-grid" data-reveal>
            {industries.map((x) => (
              <li key={x.name}>
                <p className="hf-grid-name">{x.name}</p>
                <p className="hf-grid-detail font-sans">{x.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="hf-section hf-updates" aria-labelledby="home-updates-heading">
        <div className="hf-wrap">
          <header className="hf-updates-head" data-reveal>
            <h2 id="home-updates-heading" className="hf-title">
              Shipping every week.
            </h2>
            <Link href="/changelog" className="hf-link font-sans">
              Full changelog <Arrow />
            </Link>
          </header>
          <ul className="hf-cards" data-reveal>
            {CHANGELOG.slice(0, 3).map((entry) => (
              <li key={entry.date + entry.title}>
                <Link href="/changelog">
                  <time dateTime={entry.date} className="font-sans">
                    {new Date(`${entry.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                  </time>
                  <span className="hf-card-title">{entry.title}</span>
                  <span className="hf-card-body font-sans">{entry.items[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
