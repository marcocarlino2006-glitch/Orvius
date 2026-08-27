import Link from "next/link";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 md:px-8">
        <Link href="/" className="font-sans text-[1.05rem] font-medium tracking-tight text-ink">
          Orvius
        </Link>
        <div className="flex items-center gap-7">
          <Link
            href="/dashboard"
            className="hidden font-sans text-sm text-muted transition hover:text-ink md:inline"
          >
            Product
          </Link>
          <Link href="/pilot" className="btn btn-primary">
            Start free pilot
          </Link>
        </div>
      </div>
    </header>
  );
}
