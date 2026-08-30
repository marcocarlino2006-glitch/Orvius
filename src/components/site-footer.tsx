import Link from "next/link";
import { company, legalPages } from "@/lib/company";

const productLinks = [
  { href: "/demo", label: "Demo" },
  { href: "/pricing", label: "Pricing" },
  { href: "/pilot", label: "Free pilot" },
  { href: "/about", label: "Company" },
];

const legalLinks = [
  { href: "/legal", label: "Legal center" },
  { href: "/security", label: "Security" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer border-t border-rule bg-chalk text-void">
      <div className="site-footer-accent" aria-hidden />

      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8 md:py-16">
        <div>
          <p className="flex items-center gap-2.5 font-sans text-sm font-semibold tracking-[0.2em] uppercase">
            <span className="shell-logo-mark" aria-hidden />
            <span className="shell-brand-text">
              <span>{company.productName}</span>
              <span className="shell-brand-os">OS</span>
            </span>
          </p>
          <p className="mt-3 max-w-sm font-serif text-xl leading-snug tracking-[-0.03em] text-void">
            {company.tagline}
          </p>
          <p className="mt-4 font-sans text-[11px] font-semibold tracking-[0.18em] text-ash uppercase">
            {company.trades.join(" · ")}
          </p>
          <a
            href={`mailto:${company.contactEmail}`}
            className="footer-link mt-6 inline-block font-sans text-sm text-ash hover:text-void"
          >
            {company.contactEmail}
          </a>
        </div>

        <nav aria-label="Product">
          <p className="home-os-kicker">Product</p>
          <ul className="mt-4 flex flex-col gap-3 font-sans text-sm">
            {productLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="footer-link text-ash hover:text-void">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal">
          <p className="home-os-kicker">Legal</p>
          <ul className="mt-4 flex flex-col gap-3 font-sans text-sm">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="footer-link text-ash hover:text-void">
                  {link.label}
                </Link>
              </li>
            ))}
            {legalPages.slice(4).map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="footer-link text-ash hover:text-void">
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 font-sans text-xs text-ash md:px-8">
          <p>
            © {new Date().getFullYear()} {company.legalName}. All rights reserved.
          </p>
          <p>{company.domain}</p>
        </div>
      </div>
    </footer>
  );
}
