import Link from "next/link";
import { company, legalPages } from "@/lib/company";
import { trustBadges } from "@/lib/trust";

const productLinks = [
  { href: "/demo", label: "Demo" },
  { href: "/pricing", label: "Pricing" },
  { href: "/pilot", label: "Get started" },
  { href: "/about", label: "Company" },
];

const legalLinks = [
  { href: "/legal", label: "Legal" },
  { href: "/security", label: "Security" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteFooter() {
  return (
    <footer className="premium-footer">
      <div className="editorial-wrap premium-footer-main">
        <div className="premium-footer-brand">
          <p className="premium-footer-logo font-sans">
            <span className="shell-logo-mark" aria-hidden />
            <span className="shell-brand-text">
              <span>{company.productName}</span>
              <span className="shell-brand-os">OS</span>
            </span>
          </p>
          <p className="premium-footer-tagline font-serif">{company.tagline}</p>
          <a
            href={`mailto:${company.contactEmail}`}
            className="premium-footer-email font-sans"
          >
            {company.contactEmail}
          </a>
        </div>

        <nav className="premium-footer-nav" aria-label="Product">
          <p className="premium-footer-nav-label font-sans">Product</p>
          <ul className="font-sans">
            {productLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="premium-footer-nav" aria-label="Legal">
          <p className="premium-footer-nav-label font-sans">Legal</p>
          <ul className="font-sans">
            {[...legalLinks, ...legalPages.slice(4).map((p) => ({ href: p.href, label: p.title }))].map(
              (link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ),
            )}
          </ul>
        </nav>
      </div>

      <div className="premium-footer-trust font-sans">
        <div className="editorial-wrap premium-footer-trust-inner">
          {trustBadges.map((badge) => (
            <span key={badge.label}>{badge.label}</span>
          ))}
        </div>
      </div>

      <div className="premium-footer-bar">
        <div className="editorial-wrap premium-footer-bar-inner font-sans">
          <p>© {new Date().getFullYear()} {company.legalName}</p>
          <p>{company.domain}</p>
        </div>
      </div>
    </footer>
  );
}
