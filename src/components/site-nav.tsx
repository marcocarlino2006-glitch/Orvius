import Link from "next/link";

export function SiteNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="font-display text-xl font-700 tracking-tight text-paper md:text-2xl"
          style={{ fontWeight: 700 }}
        >
          Orvius
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-paper/80 md:flex">
          <a href="#how" className="transition hover:text-paper">
            How it works
          </a>
          <a href="#product" className="transition hover:text-paper">
            Product
          </a>
          <Link href="/pilot" className="transition hover:text-paper">
            Pilot
          </Link>
        </nav>

        <Link
          href="/pilot"
          className="rounded-md bg-paper px-4 py-2 font-display text-sm font-semibold text-ink transition hover:-translate-y-0.5"
        >
          Start free pilot
        </Link>
      </div>
    </header>
  );
}
