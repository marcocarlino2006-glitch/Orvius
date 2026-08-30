import Link from "next/link";
import { HomeLiveLine } from "@/components/home-live-line";
import { OrviusOsStrip } from "@/components/orvius-os-strip";
import { company, legalPages } from "@/lib/company";

const productLinks = [
  { href: "/demo", label: "Demo" },
  { href: "/pricing", label: "Pricing" },
  { href: "/pilot", label: "Free pilot" },
  { href: "/about", label: "Company" },
];

const companyLinks = [
  { href: "/about", label: "About" },
  { href: "/legal", label: "Legal center" },
  { href: "/security", label: "Security" },
  ...legalPages.map((p) => ({ href: p.href, label: p.title })),
];

export function SiteFooter() {
  return (
    <footer className="site-footer border-t border-rule bg-chalk text-void">
      <div className="site-footer-accent" aria-hidden />

      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.3fr_1fr_1fr] md:px-8 md:py-16">
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

          <div className="mt-8">
            <OrviusOsStrip variant="light" />
          </div>

          <div className="mt-8">
            <p className="home-os-kicker">Live line</p>
            <HomeLiveLine />
          </div>

          <div className="mt-8">
            <Link href="/pilot" className="editorial-cta">
              Free pilot
            </Link>
          </div>

          <p className="mt-6 font-sans text-xs leading-relaxed text-ash">
            Operated by {company.legalName}
          </p>
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
          <p className="home-os-kicker">Legal & company</p>
          <ul className="mt-4 flex flex-col gap-3 font-sans text-sm">
            {companyLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="footer-link text-ash hover:text-void">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={`mailto:${company.contactEmail}`}
                className="footer-link text-ash hover:text-void"
              >
                {company.contactEmail}
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 font-sans text-xs text-ash md:px-8">
          <p>
            © {new Date().getFullYear()} {company.legalName}. {company.productName}{" "}
            is a product of {company.legalName}. All rights reserved.
          </p>
          <p>{company.domain}</p>
        </div>
      </div>
    </footer>
  );
}
