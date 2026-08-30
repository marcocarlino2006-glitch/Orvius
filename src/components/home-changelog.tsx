import Link from "next/link";

const entries = [
  { date: "Aug 30, 2026", title: "Field dispatch is live" },
  { date: "Aug 30, 2026", title: "Ask answers from OS memory" },
  { date: "Aug 30, 2026", title: "A lead becomes a job" },
  { date: "Aug 26, 2026", title: "The front door answers after hours" },
] as const;

export function HomeChangelog() {
  return (
    <section className="cursor-changelog" aria-labelledby="changelog-heading">
      <div className="editorial-wrap">
        <div className="cursor-changelog-head">
          <h2 id="changelog-heading" className="cursor-section-title font-sans">
            Changelog
          </h2>
          <Link href="/about" className="cursor-link font-sans">
            See all →
          </Link>
        </div>
        <ul className="cursor-changelog-list font-sans">
          {entries.map((item) => (
            <li key={item.title}>
              <time>{item.date}</time>
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
