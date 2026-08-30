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
    <section className="premium-changelog" aria-labelledby="changelog-heading">
      <div className="editorial-wrap">
        <div className="premium-changelog-head">
          <div>
            <p className="premium-kicker font-sans">Changelog</p>
            <h2 id="changelog-heading" className="premium-section-title font-serif">
              What is live.
            </h2>
            <p className="premium-body font-sans">
              Shipped in order. Nothing here is a mock.
            </p>
          </div>
          <Link href="/about" className="editorial-link font-sans">
            Full system →
          </Link>
        </div>

        <ol className="premium-changelog-list">
          {entries.map((item) => (
            <li key={item.title} className="premium-changelog-row">
              <time className="premium-changelog-date font-sans">{item.date}</time>
              <span className="premium-changelog-name font-serif">{item.title}</span>
              <span className="premium-changelog-detail font-sans">{item.detail}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
