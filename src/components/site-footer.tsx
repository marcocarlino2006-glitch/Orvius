import Link from "next/link";

const links = [
  { href: "/pilot", label: "Pilot" },
  { href: "/demo", label: "Demo" },
  { href: "/dashboard", label: "Product" },
  { href: "mailto:hello@orvius.im", label: "hello@orvius.im", external: true },
];

export function SiteFooter() {
  return (
    <footer className="site-footer border-t border-white/10 bg-void text-chalk">
      <div className="site-footer-flare mx-auto max-w-6xl px-6 md:px-8" aria-hidden />

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-14 md:flex-row md:items-end md:justify-between md:px-8 md:py-16">
        <div>
          <p className="font-sans text-sm font-semibold tracking-[0.2em] uppercase">
            Orvius
          </p>
          <p className="mt-3 max-w-xs font-serif text-lg leading-relaxed text-ash-soft">
            The AI operating partner for service businesses.
          </p>
          <p className="mt-4 font-sans text-[11px] font-semibold tracking-[0.18em] text-ash uppercase">
            HVAC · Plumbing · Electrical
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-8 gap-y-3 font-sans text-sm">
            {links.map((link) => (
              <li key={link.href}>
                {link.external ? (
                  <a href={link.href} className="footer-link text-ash-soft">
                    {link.label}
                  </a>
                ) : (
                  <Link href={link.href} className="footer-link text-ash-soft">
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
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
