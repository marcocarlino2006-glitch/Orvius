import Link from "next/link";

const entries = [
  {
    date: "Aug 30, 2026",
    title: "Field dispatch is live",
    detail: "Assign a technician. En route, on site, complete.",
  },
  {
    date: "Aug 30, 2026",
    title: "Ask answers from OS memory",
    detail: "Calls, customers, jobs, and the board — one mouth.",
  },
  {
    date: "Aug 30, 2026",
    title: "A lead becomes a job",
    detail: "Book, confirm, and schedule from the same record.",
  },
  {
    date: "Aug 29, 2026",
    title: "Customer records from first call",
    detail: "History follows the number. Returning callers are known.",
  },
  {
    date: "Aug 26, 2026",
    title: "The front door answers after hours",
    detail: "Qualify the work. Alert the owner. Write the record.",
  },
] as const;

export function HomeChangelog() {
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
              Shipped in order. Nothing here is a mock.
            </p>
          </div>
          <Link href="/about" className="editorial-link font-sans">
            See the full system →
          </Link>
        </div>

        <ol className="home-change">
          {entries.map((item) => (
            <li key={item.title} className="home-change-row">
              <time className="home-change-date font-sans">{item.date}</time>
              <span className="home-change-name font-serif">{item.title}</span>
              <span className="home-change-mod font-sans">{item.detail}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
