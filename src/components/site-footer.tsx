import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-void text-chalk">
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-20">
        <div className="flex flex-col justify-between gap-12 md:flex-row md:items-start">
          <div>
            <p className="font-sans text-sm font-semibold tracking-[0.18em] uppercase">
              Orvius
            </p>
            <p className="mt-4 max-w-sm font-serif text-lg leading-relaxed text-ash-soft">
              The AI operating partner for service businesses.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-4 font-sans text-sm text-ash-soft">
            <Link href="/pilot" className="transition hover:text-chalk">
              Pilot
            </Link>
            <Link href="/demo" className="transition hover:text-chalk">
              Demo
            </Link>
            <Link href="/dashboard" className="transition hover:text-chalk">
              Product
            </Link>
            <a href="mailto:hello@orvius.im" className="transition hover:text-chalk">
              hello@orvius.im
            </a>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-8 font-sans text-xs text-ash">
          <p>© {new Date().getFullYear()} Orvius</p>
          <p>orvius.im</p>
        </div>
      </div>
    </footer>
  );
}
