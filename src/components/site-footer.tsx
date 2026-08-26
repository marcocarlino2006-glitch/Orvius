import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="text-lg font-semibold">Orvius</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              The AI operating partner for service businesses. Never miss a call,
              capture every lead, and run your business with less friction.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Product</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>
                <a href="#features" className="hover:text-foreground">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-foreground">
                  Pricing
                </a>
              </li>
              <li>
                <Link href="/admin" className="hover:text-foreground">
                  Admin
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-medium">Company</p>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>
                <Link href="/domains" className="hover:text-foreground">
                  Domain setup
                </Link>
              </li>
              <li>
                <a href="mailto:hello@orvius.com" className="hover:text-foreground">
                  hello@orvius.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-8 text-xs text-muted">
          <p>© {new Date().getFullYear()} Orvius. All rights reserved.</p>
          <p>Built for HVAC, plumbing, electrical & home services.</p>
        </div>
      </div>
    </footer>
  );
}
