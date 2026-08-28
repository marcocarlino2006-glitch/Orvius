import {
  MarketingShell,
  ShellPageIntro,
} from "@/components/marketing-shell";
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
    <MarketingShell headerPosition="sticky" cta={{ href: "/pilot", label: "Start free pilot" }}>
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-28 md:px-8 md:pt-32">
        <ShellPageIntro label={label} title={title} description={description} />
        <p className="mt-6 font-sans text-xs tracking-wide text-ash uppercase">
          Last updated {updated} · {company.legalName}
        </p>
        <article className="legal-prose mt-10">{children}</article>
        <p className="mt-12 border-t border-white/10 pt-8 font-sans text-sm text-ash-soft">
          Questions?{" "}
          <a
            href={`mailto:${company.contactEmail}`}
            className="footer-link text-chalk"
          >
            {company.contactEmail}
          </a>
          {" · "}
          <Link href="/pricing" className="footer-link text-chalk">
            Pricing
          </Link>
        </p>
      </main>
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
