import Link from "next/link";
import { company, legalPages } from "@/lib/company";

const badges = [
  { label: "TCPA-compliant SMS", detail: "Owner alerts with opt-out" },
  { label: "Encrypted in transit", detail: "TLS on all endpoints" },
  { label: "Per-tenant isolation", detail: "Your data, your shop" },
  { label: "Legal entity", detail: company.legalName },
] as const;

export function TrustStrip() {
  return (
    <section className="trust-section border-t border-white/8">
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-20">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-md">
            <p className="eyebrow">Enterprise readiness</p>
            <h2 className="mt-4 font-serif text-[clamp(1.75rem,3vw,2.25rem)] leading-[1.1] tracking-[-0.04em] text-chalk">
              Operated by {company.legalName}
            </h2>
            <p className="mt-4 font-sans text-sm leading-relaxed text-ash-soft">
              Contracts, billing, and legal policies are with our registered
              company. {company.productName} is built for shops that need
              reliability from day one — not a side project.
            </p>
          </div>

          <ul className="trust-badge-grid">
            {badges.map((badge) => (
              <li key={badge.label} className="trust-badge">
                <span className="trust-badge-dot" aria-hidden />
                <div>
                  <p className="font-sans text-sm font-semibold text-chalk">
                    {badge.label}
                  </p>
                  <p className="mt-1 font-sans text-xs text-ash-soft">
                    {badge.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/8 pt-8 font-sans text-sm">
          {legalPages.slice(0, 4).map((page) => (
            <Link key={page.href} href={page.href} className="footer-link text-ash-soft">
              {page.title}
            </Link>
          ))}
          <Link href="/legal" className="footer-link text-chalk">
            All policies →
          </Link>
        </div>
      </div>
    </section>
  );
}
