import Link from "next/link";
import { company } from "@/lib/company";
import { OrviusLogo } from "@/components/orvius-logo";

const productLinks = [
  { href: "/demo", label: "Live demo" },
  { href: "/login", label: "Sign in" },
  { href: "/pricing", label: "Pricing" },
  { href: "/pilot", label: "Design partner" },
];

const companyLinks = [
  { href: "/about", label: "Company" },
  { href: "/security", label: "Security" },
  { href: `mailto:${company.contactEmail}`, label: "Contact" },
];

const legalLinks = [
  { href: "/legal", label: "Legal center" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteFooter() {
  return (
    <footer className="tier1-footer">
      <div className="editorial-wrap tier1-footer-main font-sans">
        <div className="tier1-footer-brand">
          <OrviusLogo size="lg" variant="void" />
          <p className="tier1-footer-tagline">{company.tagline}</p>
          <p className="tier1-footer-entity">{company.legalName}</p>
        </div>

        <div className="tier1-footer-columns">
          <nav aria-label="Product">
            <p className="tier1-footer-label">Product</p>
            <ul>
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Company">
            <p className="tier1-footer-label">Company</p>
            <ul>
              {companyLinks.map((link) => (
                <li key={link.href}>
                  {link.href.startsWith("mailto:") ? (
                    <a href={link.href}>{link.label}</a>
                  ) : (
                    <Link href={link.href}>{link.label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="tier1-footer-label">Legal</p>
            <ul>
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      <div className="editorial-wrap tier1-footer-bar font-sans">
        <p>© {new Date().getFullYear()} {company.legalName}</p>
        <p>{company.domain}</p>
      </div>
    </footer>
  );
}
