import { osRings } from "@/lib/company";
import { demoLineHref } from "@/lib/demo-line";
import Link from "next/link";

export function HomePlatformSection() {
  const liveRings = osRings.filter((ring) => ring.status === "live");

  return (
    <section className="home-platform" aria-label="Platform">
      <div className="editorial-wrap">
        <div className="home-platform-head">
          <p className="home-platform-kicker font-sans">The OS</p>
          <h2 className="home-platform-title font-sans">
            Four rings. One system of record.
          </h2>
          <p className="home-platform-lead font-sans">
            Start at the front door. Expand when the shop is ready — every ring
            writes to the same customer and job history.
          </p>
        </div>

        <ol className="home-platform-rings">
          {liveRings.map((ring) => (
            <li key={ring.ring} className="home-platform-ring">
              <span className="home-platform-ring-num font-sans">
                {String(ring.ring).padStart(2, "0")}
              </span>
              <div>
                <h3 className="home-platform-ring-name font-sans">{ring.name}</h3>
                <p className="home-platform-ring-module font-sans">{ring.module}</p>
                <p className="home-platform-ring-body font-sans">{ring.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="home-platform-actions font-sans">
          <a href={demoLineHref()} className="btn btn-void text-sm">
            Call live demo
          </a>
          <Link href="/demo" className="home-platform-link">
            Simulate in browser →
          </Link>
        </div>
      </div>
    </section>
  );
}
