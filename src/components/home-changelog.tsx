import { osRings } from "@/lib/company";
import Link from "next/link";

export function HomeChangelog() {
  const live = osRings.filter((ring) => ring.status === "live");
  const next = osRings.find((ring) => ring.status === "next");

  return (
    <section className="editorial-section" aria-labelledby="changelog-heading">
      <div className="editorial-wrap">
        <div className="home-change-head">
          <div>
            <p className="home-kicker font-sans">Changelog</p>
            <h2 id="changelog-heading" className="editorial-heading font-serif">
              What is live.
            </h2>
            <p className="editorial-body font-sans">
              One ring at a time. Nothing here is a mock. Shops use this today.
            </p>
          </div>
          <Link href="/about" className="editorial-link font-sans">
            Full system →
          </Link>
        </div>

        <ol className="home-change">
          {[...live].reverse().map((item) => (
            <li key={item.ring} className="home-change-row">
              <span className="home-change-num font-sans">
                {String(item.ring).padStart(2, "0")}
              </span>
              <span className="home-change-name font-serif">{item.name}</span>
              <span className="home-change-mod font-sans">{item.module}</span>
              <span className="home-change-status font-sans">Live</span>
            </li>
          ))}
          {next ? (
            <li className="home-change-row home-change-row-next">
              <span className="home-change-num font-sans">
                {String(next.ring).padStart(2, "0")}
              </span>
              <span className="home-change-name font-serif">{next.name}</span>
              <span className="home-change-mod font-sans">{next.module}</span>
              <span className="home-change-status font-sans">Next</span>
            </li>
          ) : null}
        </ol>
      </div>
    </section>
  );
}
