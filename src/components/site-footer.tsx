import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink text-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-display text-3xl font-700" style={{ fontWeight: 700 }}>
            Orvius
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-paper/70">
            The AI operating partner for service businesses.
          </p>
        </div>

        <div className="flex flex-wrap gap-6 text-sm text-paper/70">
          <Link href="/pilot" className="hover:text-paper">
            Pilot
          </Link>
          <Link href="/demo" className="hover:text-paper">
            Demo
          </Link>
          <a href="mailto:hello@orvius.im" className="hover:text-paper">
            hello@orvius.im
          </a>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-paper/50">
          <p>© {new Date().getFullYear()} Orvius · orvius.im</p>
          <p>Built for HVAC, plumbing, electrical & home services</p>
        </div>
      </div>
    </footer>
  );
}
