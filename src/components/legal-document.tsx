import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { company } from "@/lib/company";
import Link from "next/link";
import type { ReactNode } from "react";

type LegalDocumentProps = {
  label: string;
  title: string;
  description: string;
  updated: string;
  children: ReactNode;
};

export function LegalDocument({
  label,
  title,
  description,
  updated,
  children,
}: LegalDocumentProps) {
  return (
    <MarketingShell cta={{ href: "/pilot", label: "Apply for pilot" }}>
      <section className="marketing-hero">
        <div className="editorial-wrap max-w-3xl">
          <ShellPageIntro label={label} title={title} description={description} />
          <p className="mt-6 font-sans text-xs tracking-wide text-ash uppercase">
            Last updated {updated} · {company.legalName}
          </p>
        </div>
      </section>

      <section className="marketing-section">
        <div className="editorial-wrap max-w-3xl">
          <article className="legal-prose">{children}</article>
          <p className="mt-12 border-t border-rule pt-8 font-sans text-sm text-ash">
            Questions?{" "}
            <a
              href={`mailto:${company.contactEmail}`}
              className="home-platform-link"
            >
              {company.contactEmail}
            </a>
            {" · "}
            <Link href="/legal" className="home-platform-link">
              Legal center
            </Link>
            {" · "}
            <Link href="/pricing" className="home-platform-link">
              Pricing
            </Link>
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
