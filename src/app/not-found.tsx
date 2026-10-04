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
            subline="We couldn't find that page. It may have moved, or the link may be mistyped."
            description="Try the home page, or search the help center."
            align="center"
          />
          <div className="tier1-actions justify-center font-sans mt-8">
            <Link href="/" className="ov-btn ov-btn--solid">
              Back to home
            </Link>
            <Link href="/help" className="ov-btn ov-btn--quiet">
              Help center
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
