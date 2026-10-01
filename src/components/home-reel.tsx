import Image from "next/image";

type Shot = {
  id: string;
  label: string;
  title: string;
  src: string;
  width: number;
  height: number;
  kind: "desk" | "phone" | "panel";
};

const shots: Shot[] = [
  {
    id: "command",
    label: "Command",
    title: "The morning list, sorted by what's at stake.",
    src: "/marketing/product/command.webp",
    width: 1600,
    height: 1000,
    kind: "desk",
  },
  {
    id: "tech",
    label: "Team page",
    title: "Address, time, one tap to call.",
    src: "/marketing/product/tech.webp",
    width: 640,
    height: 1385,
    kind: "phone",
  },
  {
    id: "inbox",
    label: "Inbox",
    title: "Every caller, summarized.",
    src: "/marketing/product/inbox.webp",
    width: 1600,
    height: 1000,
    kind: "desk",
  },
  {
    id: "receptionist",
    label: "Receptionist",
    title: "Your opening line, your voice, your rules.",
    src: "/marketing/product/s-receptionist.webp",
    width: 2400,
    height: 1780,
    kind: "panel",
  },
  {
    id: "calls",
    label: "Calls",
    title: "Every call graded, the rough ones flagged.",
    src: "/marketing/product/calls.webp",
    width: 1600,
    height: 1000,
    kind: "desk",
  },
  {
    id: "confirm",
    label: "Customer text",
    title: "The time, your number, one tap to confirm.",
    src: "/marketing/product/confirm.webp",
    width: 640,
    height: 1385,
    kind: "phone",
  },
  {
    id: "jobs",
    label: "Schedule",
    title: "Booked work with who, when and how much.",
    src: "/marketing/product/jobs.webp",
    width: 1600,
    height: 1000,
    kind: "desk",
  },
  {
    id: "team",
    label: "Team",
    title: "Give your staff access in one line.",
    src: "/marketing/product/s-team.webp",
    width: 2400,
    height: 1780,
    kind: "panel",
  },
];

function Card({ shot, hidden }: { shot: Shot; hidden?: boolean }) {
  return (
    <figure
      className={`hr-card hr-card--${shot.kind}`}
      aria-hidden={hidden || undefined}
    >
      <div className="hr-frame">
        <Image
          src={shot.src}
          alt={
            hidden
              ? ""
              : `Orvius ${shot.label.toLowerCase()} screen: ${shot.title}`
          }
          width={shot.width}
          height={shot.height}
          sizes={shot.kind === "phone" ? "16rem" : "52rem"}
          priority={!hidden && shot.id === "command"}
        />
      </div>
      <figcaption>
        <span className="hr-label font-sans">{shot.label}</span>
        <span className="hr-title">{shot.title}</span>
      </figcaption>
    </figure>
  );
}

/**
 * The real product, drifting past right under the hero. The set is rendered
 * twice so the loop is seamless; the copy is hidden from assistive tech.
 * Hover or focus pauses it, and reduced motion turns it into a plain scroller.
 */
export function HomeReel() {
  return (
    <section className="hr-section" aria-labelledby="home-reel-heading">
      <div className="hr-pad">
        <div className="editorial-wrap mkt-section-inner hr-head">
          <p className="mkt-manifesto-kicker font-sans">The product</p>
          <h2 id="home-reel-heading" className="hx-title">
            Not a voicemail. A front office.
          </h2>
          <p className="hr-sub font-sans">
            Calls, customers, the schedule and your team on one board, plus a
            page for whoever is on the way and a text for whoever called. Real
            screens, sample data.
          </p>
        </div>
      </div>
      <div className="hr-viewport" tabIndex={0} aria-label="Product screens">
        <div className="hr-track">
          {shots.map((shot) => (
            <Card key={shot.id} shot={shot} />
          ))}
          {shots.map((shot) => (
            <Card key={`${shot.id}-loop`} shot={shot} hidden />
          ))}
        </div>
      </div>
    </section>
  );
}
