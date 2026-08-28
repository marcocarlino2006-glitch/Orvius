import Link from "next/link";
import { company } from "@/lib/company";

const productLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/pilot", label: "Pilot" },
  { href: "/demo", label: "Demo" },
  { href: "/dashboard", label: "Product" },
];

const legalLinks = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer border-t border-white/10 bg-void text-chalk">
      <div className="site-footer-flare mx-auto max-w-6xl px-6 md:px-8" aria-hidden />

      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.2fr_1fr_1fr] md:px-8 md:py-16">
        <div>
          <p className="font-sans text-sm font-semibold tracking-[0.2em] uppercase">
            {company.productName}
          </p>
          <p className="mt-3 max-w-xs font-serif text-lg leading-relaxed text-ash-soft">
            {company.tagline}
          </p>
          <p className="mt-4 font-sans text-[11px] font-semibold tracking-[0.18em] text-ash uppercase">
            {company.trades.join(" · ")}
          </p>
          <p className="mt-6 font-sans text-xs leading-relaxed text-ash">
            A product of {company.legalName}
          </p>
        </div>

        <nav aria-label="Product">
          <p className="font-sans text-[10px] font-bold tracking-[0.2em] text-ash uppercase">
            Product
          </p>
          <ul className="mt-4 flex flex-col gap-3 font-sans text-sm">
            {productLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="footer-link text-ash-soft">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal">
          <p className="font-sans text-[10px] font-bold tracking-[0.2em] text-ash uppercase">
            Company
          </p>
          <ul className="mt-4 flex flex-col gap-3 font-sans text-sm">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="footer-link text-ash-soft">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={`mailto:${company.contactEmail}`}
                className="footer-link text-ash-soft"
              >
                {company.contactEmail}
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 font-sans text-xs text-ash md:px-8">
          <p>
            © {new Date().getFullYear()} {company.legalName}. {company.productName}{" "}
            is a product of {company.legalName}.
          </p>
          <p>{company.domain}</p>
        </div>
      </div>
    </footer>
  );
}
