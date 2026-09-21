import { BrandIntro } from "@/components/brand-intro";
import { MarketingShell } from "@/components/marketing-shell";
import Link from "next/link";

export default function NotFound() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact min-h-[70svh] flex flex-col justify-center">
        <div className="editorial-wrap max-w-md mx-auto text-center">
          <BrandIntro
            brand
            title="Page not found."
            subline="This route doesn't exist in Orvius."
            description="Head back — every call, every customer, every job."
            align="center"
          />
          <div className="tier1-actions justify-center font-sans mt-8">
            <Link href="/" className="ov-btn ov-btn--solid">
              Back to home
            </Link>
            <Link href="/pilot" className="ov-btn ov-btn--quiet">
              Book a call audit
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
