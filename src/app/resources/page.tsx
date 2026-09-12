import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Resources",
  description: `Guides, trust, and company resources for ${company.productName}.`,
};

const groups = [
  {
    heading: "Get started",
    links: [
      { href: "/demo", label: "Run a demo call" },
      { href: "/pilot", label: "Prove it on your line" },
      { href: "/pricing", label: "Pricing & plans" },
    ],
  },
  {
    heading: "Trust & legal",
    links: [
      { href: "/security", label: "Security practices" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of service" },
      { href: "/legal", label: "Legal hub" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About Orvius" },
      { href: "/enterprise", label: "Multi-shop" },
      { href: "mailto:hello@orvius.im", label: "Contact us" },
    ],
  },
] as const;

export default function ResourcesPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Resources"
            title="Guides, trust, and company links."
            subline="Guides, trust, and the company behind the line."
            description="Start a demo, read how we handle your data, or reach the team."
          />
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap mkt-resources-grid">
          {groups.map((group) => (
            <div key={group.heading} className="mkt-resources-col">
              <p className="tier1-eyebrow type-eyebrow">{group.heading}</p>
              <ul className="mkt-resources-list font-sans">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("mailto:") ? (
                      <a href={link.href} className="mkt-resources-link">
                        {link.label}
                        <span aria-hidden> →</span>
                      </a>
                    ) : (
                      <Link href={link.href} className="mkt-resources-link">
                        {link.label}
                        <span aria-hidden> →</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
