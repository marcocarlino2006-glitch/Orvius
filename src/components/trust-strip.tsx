import Link from "next/link";
import { company, legalPages } from "@/lib/company";

export function TrustStrip() {
  return (
    <section className="border-t border-white/8 bg-panel/40">
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-8">
        <p className="eyebrow">Trust & compliance</p>
        <p className="mt-3 max-w-2xl font-serif text-2xl tracking-[-0.03em] text-chalk">
          Operated by {company.legalName}
        </p>
        <p className="mt-3 max-w-xl font-sans text-sm leading-relaxed text-ash-soft">
          Contracts, billing, and legal policies are with our registered company.
          {company.productName} is built for shops that need enterprise-grade
          reliability from day one.
        </p>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-sans text-sm">
          {legalPages.slice(0, 4).map((page) => (
            <li key={page.href}>
              <Link href={page.href} className="footer-link text-ash-soft">
                {page.title}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/legal" className="footer-link text-chalk">
              All policies →
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
