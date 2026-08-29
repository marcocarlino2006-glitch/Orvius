import {
  MarketingShell,
  ShellPageIntro,
  ShellVoidPanel,
} from "@/components/marketing-shell";
import { company, legalPages } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal",
  description: `Legal policies for ${company.productName}, operated by ${company.legalName}.`,
};

export default function LegalHubPage() {
  return (
    <MarketingShell headerPosition="sticky" cta={false} atmosphere>
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-28 md:px-8 md:pt-32">
        <ShellPageIntro
          label="Legal"
          title="Policies & compliance"
          description={`${company.productName} is operated by ${company.legalName}. These documents govern your use of our website and services.`}
        />

        <p className="mt-6 font-sans text-xs tracking-wide text-ash uppercase">
          Last updated {company.legalUpdated} · {company.legalName}
        </p>

        <ul className="mt-10 space-y-4">
          {legalPages.map((page) => (
            <li key={page.href}>
              <Link
                href={page.href}
                className="block rounded-md border border-white/10 bg-white/3 px-5 py-4 transition-colors hover:border-flare/30 hover:bg-white/5"
              >
                <p className="font-sans text-sm font-semibold text-chalk">
                  {page.title}
                </p>
                <p className="mt-1 font-sans text-sm leading-relaxed text-ash-soft">
                  {page.summary}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <ShellVoidPanel className="mt-12 p-6 md:p-8">
          <p className="eyebrow">Contact</p>
          <p className="mt-3 font-sans text-sm leading-relaxed text-ash-soft">
            Legal and privacy requests:{" "}
            <a
              href={`mailto:${company.legalEmail}`}
              className="footer-link text-chalk"
            >
              {company.legalEmail}
            </a>
          </p>
          <p className="mt-3 font-sans text-xs text-ash">
            {company.legalName} · {company.domain}
          </p>
        </ShellVoidPanel>
      </main>
    </MarketingShell>
  );
}
