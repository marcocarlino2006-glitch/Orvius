import { osRings } from "@/lib/company";

const pathRings = osRings.filter((ring) => ring.status === "live").slice(0, 6);

/** Destination beat — front door today, OS as you grow. Signal only. */
export function HomeOsPath() {
  return (
    <section className="home-os-path" aria-labelledby="home-os-path-heading">
      <div className="editorial-wrap">
        <p className="tier1-eyebrow type-eyebrow">The operating system</p>
        <h2 id="home-os-path-heading" className="tier1-section-title type-headline">
          Front door today. Command of the shop as you grow.
        </h2>
        <p className="tier1-section-lead font-sans">
          Start by answering every call. Expand into customers, jobs, field, money,
          and intelligence — one airtight loop at a time.
        </p>

        <ol className="home-os-path-list font-sans">
          {pathRings.map((ring, index) => (
            <li
              key={ring.ring}
              className="home-os-path-item"
              style={{ animationDelay: `${0.06 * index}s` }}
            >
              <span className="home-os-path-num">
                {String(ring.ring).padStart(2, "0")}
              </span>
              <span className="home-os-path-name">{ring.name}</span>
              <span className="home-os-path-module">{ring.module}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
