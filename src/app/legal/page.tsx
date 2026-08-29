import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company, legalPages } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal",
  description: `Legal policies for ${company.productName}, operated by ${company.legalName}.`,
};

export default function LegalHubPage() {
  return (
    <MarketingShell cta={false}>
      <section className="editorial-hero">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Legal"
            title="Policies & compliance"
            description={`${company.productName} is operated by ${company.legalName}. These documents govern your use of our website and services.`}
          />
          <p className="mt-6 font-sans text-xs tracking-wide text-ash uppercase">
            Last updated {company.legalUpdated} · {company.legalName}
          </p>
        </div>
      </section>

      <section className="editorial-section">
        <div className="editorial-wrap max-w-3xl">
          <ul className="divide-y divide-rule border-y border-rule">
            {legalPages.map((page) => (
              <li key={page.href}>
                <Link
                  href={page.href}
                  className="block py-5 transition-colors hover:bg-fog/40 md:py-6"
                >
                  <p className="font-sans text-sm font-semibold text-void">
                    {page.title}
                  </p>
                  <p className="mt-1 font-sans text-sm leading-relaxed text-ash">
                    {page.summary}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-12">
            <p className="font-sans text-[11px] font-bold tracking-[0.2em] text-ash uppercase">
              Contact
            </p>
            <p className="mt-3 font-sans text-sm leading-relaxed text-ash">
              Legal and privacy requests:{" "}
              <a
                href={`mailto:${company.legalEmail}`}
                className="editorial-link"
              >
                {company.legalEmail}
              </a>
            </p>
            <p className="mt-2 font-sans text-xs text-ash">
              {company.legalName} · {company.domain}
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
