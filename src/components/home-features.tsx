import Image from "next/image";
import Link from "next/link";

type Feature = {
  id: string;
  title: string;
  body: string;
  link: { href: string; label: string };
  art: string;
  shots: { src: string; width: number; height: number; alt: string }[];
};

const features: Feature[] = [
  {
    id: "receptionist",
    title: "Answers in your name, the way you would.",
    body: "Set the opening line, the voice, your hours and what it handles on its own. Gas, smoke and medical emergencies get safety steps first, then you.",
    link: { href: "/product", label: "See how the receptionist works" },
    art: "/marketing/art/dusk.webp",
    shots: [{ src: "/marketing/product/s-receptionist.webp", width: 2400, height: 1780, alt: "Receptionist settings: opening line, voice and transfer number" }],
  },
  {
    id: "command",
    title: "Your morning, already sorted.",
    body: "Overnight calls land as a short list, each with the dollar value at stake and the one thing to do next.",
    link: { href: "/product", label: "Explore the board" },
    art: "/marketing/art/dawn.webp",
    shots: [{ src: "/marketing/product/command.webp", width: 1600, height: 1000, alt: "Command board with the morning queue and revenue at risk" }],
  },
  {
    id: "calls",
    title: "Every call on the record.",
    body: "Recorded, transcribed and graded, with the rough ones flagged. Each caller becomes a lead with a written summary, so nobody plays back a voicemail to learn what they wanted.",
    link: { href: "/pilot", label: "Get a free call audit" },
    art: "/marketing/art/night.webp",
    shots: [{ src: "/marketing/product/calls.webp", width: 1600, height: 1000, alt: "Calls list with grades and flagged calls" }],
  },
  {
    id: "field",
    title: "Booked, confirmed, on the way.",
    body: "The customer gets the time and your number with one tap to confirm. Whoever is going gets the address and one tap to call. No app to install.",
    link: { href: "/help", label: "Read the help center" },
    art: "/marketing/art/morning.webp",
    shots: [
      { src: "/marketing/product/confirm.webp", width: 640, height: 1385, alt: "Customer confirmation page on a phone" },
      { src: "/marketing/product/tech.webp", width: 640, height: 1385, alt: "Team member job page on a phone" },
    ],
  },
];

const industries = [
  { name: "Home services", detail: "HVAC, plumbing, electrical, roofing, garage doors, appliance repair" },
  { name: "On-site services", detail: "Pest control, cleaning, moving, locksmiths" },
  { name: "Health", detail: "Dental and medical offices" },
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
              <div className={`hf-art ${f.shots.length > 1 ? "hf-art--phones" : ""}`}>
                <Image src={f.art} alt="" fill sizes="(max-width: 900px) 100vw, 60vw" className="hf-art-bg" />
                {f.shots.map((s) => (
                  <Image
                    key={s.src}
                    src={s.src}
                    alt={s.alt}
                    width={s.width}
                    height={s.height}
                    sizes={f.shots.length > 1 ? "14rem" : "(max-width: 900px) 92vw, 52rem"}
                    className="hf-shot"
                  />
                ))}
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
    </>
  );
}
