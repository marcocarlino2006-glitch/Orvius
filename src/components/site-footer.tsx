import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-void text-chalk">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 md:flex-row md:items-end md:justify-between md:px-8 md:py-16">
        <div>
          <p className="font-sans text-sm font-semibold tracking-[0.2em] uppercase">
            Orvius
          </p>
          <p className="mt-3 max-w-xs font-serif text-lg leading-relaxed text-ash-soft">
            The AI operating partner for service businesses.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3 font-sans text-sm text-ash-soft">
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

      <div className="border-t border-white/8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 font-sans text-xs text-ash md:px-8">
          <p>© {new Date().getFullYear()} Orvius</p>
          <p>orvius.im</p>
        </div>
      </div>
    </footer>
  );
}
