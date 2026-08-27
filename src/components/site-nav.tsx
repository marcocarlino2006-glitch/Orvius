import Link from "next/link";

export function SiteNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-8">
        <Link
          href="/"
          className="font-sans text-[1.05rem] font-medium tracking-tight text-paper"
        >
          Orvius
        </Link>

        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="hidden font-sans text-sm text-paper/70 transition hover:text-paper md:inline"
          >
            Product
          </Link>
          <Link
            href="/pilot"
            className="rounded-full bg-paper px-4 py-2 font-sans text-sm font-500 text-ink transition hover:bg-white"
          >
            Start free pilot
          </Link>
        </div>
      </div>
    </header>
  );
}
