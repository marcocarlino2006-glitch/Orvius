import Link from "next/link";
import { company } from "@/lib/company";
import { OrviusLogo } from "@/components/orvius-logo";

const links = [
  { href: "/demo", label: "Demo" },
  { href: "/pricing", label: "Pricing" },
  { href: "/pilot", label: "Get started" },
  { href: "/about", label: "Company" },
  { href: "/legal", label: "Legal" },
  { href: "/security", label: "Security" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export function SiteFooter() {
  return (
    <footer className="cursor-footer">
      <div className="editorial-wrap cursor-footer-inner font-sans">
        <div className="cursor-footer-brand">
          <p className="cursor-footer-logo">
            <OrviusLogo size="sm" variant="void" showOs={false} />
          </p>
          <p className="cursor-footer-tag">{company.tagline}</p>
          <a href={`mailto:${company.contactEmail}`} className="cursor-footer-email">
            {company.contactEmail}
          </a>
        </div>
        <nav className="cursor-footer-nav" aria-label="Footer">
          <ul>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="editorial-wrap cursor-footer-bar font-sans">
        <p>© {new Date().getFullYear()} {company.legalName}</p>
        <p>{company.domain}</p>
      </div>
    </footer>
  );
}
