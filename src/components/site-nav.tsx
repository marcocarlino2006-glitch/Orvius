import Link from "next/link";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 text-sm font-bold text-white">
            O
          </span>
          <span className="text-lg font-semibold tracking-tight">Orvius</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#how-it-works" className="hover:text-foreground">
            How it works
          </a>
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <a href="#pricing" className="hover:text-foreground">
            Pricing
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/admin" className="hidden text-sm text-muted hover:text-foreground sm:block">
            Sign in
          </Link>
          <Link href="#early-access" className="btn btn-primary text-sm">
            Get early access
          </Link>
        </div>
      </div>
    </header>
  );
}
